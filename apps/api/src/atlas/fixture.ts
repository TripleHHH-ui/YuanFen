import { readFileSync } from "node:fs";
import type { FlightOption } from "@yuanfen/shared";
import { recordEvidence } from "../evidence.js";
import type {
  AtlasClient,
  Envelope,
  OrderData,
  PassengerInput,
  PayData,
  SearchData,
  SearchParams,
  StatusData,
  VerifyData,
} from "./types.js";

interface FixtureSearchFile {
  searches: Array<{
    origin: string;
    destination: string;
    depart: string;
    envelope: Envelope<SearchData>;
  }>;
}

function djb2(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  return h.toString(36).toUpperCase();
}

function maskName(name: string): string {
  return name
    .split(/([/\s])/)
    .map((part) =>
      /[/\s]/.test(part) || part.length <= 1
        ? part
        : `${part[0]}${"*".repeat(part.length - 2)}${part[part.length - 1]}`,
    )
    .join("");
}

/**
 * Offline stand-in for the atlas-flight CLI, serving checked-in fixture
 * envelopes. Everything it returns is labeled mode:"fixture" in the evidence
 * log and carries a FIXTURE badge in the UI. Deterministic: same inputs, same
 * ids. Settlement stays a fixed state machine — no generated values.
 */
export class FixtureAtlasClient implements AtlasClient {
  readonly mode = "fixture" as const;
  readonly environment = "sandbox";

  private searches: FixtureSearchFile;
  private counter = 0;
  private usedConfirmations = new Set<string>();
  private ordersByConfirmation = new Map<string, OrderData>();
  private paidOrders = new Map<string, { pnr: string; tickets: string[] }>();
  private priceBumpOfferIds: Set<string>;

  constructor(searchesFile: string, opts: { priceBumpOfferIds?: string[] } = {}) {
    this.searches = JSON.parse(readFileSync(searchesFile, "utf8")) as FixtureSearchFile;
    this.priceBumpOfferIds = new Set(opts.priceBumpOfferIds ?? []);
  }

  private record(op: string, requestId: string, summary: string): void {
    recordEvidence({
      request_id: requestId,
      ts: new Date().toISOString(),
      op,
      env: this.environment,
      mode: this.mode,
      summary,
    });
  }

  private nextId(op: string): string {
    this.counter += 1;
    return `fx-${op}-${this.counter}`;
  }

  private envelope<T>(op: string, code: string, data: T | null, message = ""): Envelope<T> {
    return {
      schema_version: "1",
      status: code === "OK" ? "ok" : "error",
      code,
      message,
      retryable: false,
      request_id: this.nextId(op),
      data,
      details: null,
    };
  }

  private allOffers(): FlightOption[] {
    return this.searches.searches.flatMap((s) => s.envelope.data?.offers ?? []);
  }

  async search(params: SearchParams): Promise<Envelope<SearchData>> {
    const match = this.searches.searches.find(
      (s) =>
        s.origin === params.origin &&
        s.destination === params.destination &&
        s.depart === params.depart,
    );
    const env = match
      ? { ...match.envelope, request_id: this.nextId("search") }
      : this.envelope<SearchData>("search", "NO_ROUTES", null, "No fixture route for this query");
    this.record(
      "search",
      env.request_id,
      `${params.origin}->${params.destination} ${params.depart} (${env.data?.offers.length ?? 0} offers)`,
    );
    return env;
  }

  async offerVerify(offerId: string): Promise<Envelope<VerifyData>> {
    const offer = this.allOffers().find((o) => o.offer_id === offerId);
    let env: Envelope<VerifyData>;
    if (!offer) {
      env = this.envelope<VerifyData>("verify", "OFFER_NOT_FOUND", null, "Unknown offer id");
    } else {
      const bump = this.priceBumpOfferIds.has(offerId) ? 18 : 0;
      const baseTotal = offer.price.base + offer.bags.checked_fee;
      env = this.envelope<VerifyData>("verify", "OK", {
        booking_id: `fxbk-${djb2(offerId)}`,
        offer,
        price_status: "current",
        verified_base: offer.price.base + bump,
        verified_total_with_bag: baseTotal + bump,
        price_changed: bump > 0,
        ...(bump > 0 ? { previous_total_with_bag: baseTotal } : {}),
      });
    }
    this.record("offer verify", env.request_id, `offer ${offerId} -> ${env.code}`);
    return env;
  }

  async orderCreate(
    bookingId: string,
    passengers: PassengerInput[],
  ): Promise<Envelope<OrderData>> {
    const hash = djb2(bookingId);
    const bookingOffer = this.allOffers().find((o) => `fxbk-${djb2(o.offer_id)}` === bookingId);
    if (!bookingOffer || passengers.length === 0) {
      const env = this.envelope<OrderData>("order create", "BOOKING_NOT_FOUND", null, "Unknown booking");
      this.record("order create", env.request_id, `booking ${bookingId} -> ${env.code}`);
      return env;
    }
    const order: OrderData = {
      order_no: `FXORD-${hash}`,
      payment_confirmation_id: `fxpay-${hash}`,
      summary: {
        flight_no: bookingOffer.flight_no,
        route: `${bookingOffer.origin}-${bookingOffer.destination}`,
        depart: `${bookingOffer.departDate} ${bookingOffer.departLocal}`,
        passenger_masked: maskName(passengers[0]!.full_name),
        total: bookingOffer.price.base + bookingOffer.bags.checked_fee,
        currency: bookingOffer.price.currency,
        payment_deadline: "30 minutes",
      },
    };
    this.ordersByConfirmation.set(order.payment_confirmation_id, order);
    const env = this.envelope<OrderData>("order create", "OK", order);
    // Evidence carries the order id only — passenger details are one-time
    // input and never logged (L2 rule).
    this.record("order create", env.request_id, `booking ${bookingId} -> ${order.order_no}`);
    return env;
  }

  async orderPay(confirmationId: string): Promise<Envelope<PayData>> {
    let env: Envelope<PayData>;
    if (this.usedConfirmations.has(confirmationId)) {
      env = this.envelope<PayData>("order pay", "CONFIRMATION_USED", null, "Payment confirmation id is single-use");
    } else {
      const order = this.ordersByConfirmation.get(confirmationId);
      if (!order) {
        env = this.envelope<PayData>("order pay", "CONFIRMATION_NOT_FOUND", null, "Unknown confirmation id");
      } else {
        this.usedConfirmations.add(confirmationId);
        const hash = djb2(order.order_no);
        this.paidOrders.set(order.order_no, {
          pnr: hash.padEnd(6, "X").slice(0, 6),
          tickets: [`999-24${hash.replace(/\D/g, "").padEnd(8, "0").slice(0, 8)}`],
        });
        env = this.envelope<PayData>("order pay", "OK", { order_no: order.order_no, payment_status: "paid" });
      }
    }
    this.record("order pay", env.request_id, `confirmation ${confirmationId} -> ${env.code}`);
    return env;
  }

  async orderStatus(orderNo: string): Promise<Envelope<StatusData>> {
    const paid = this.paidOrders.get(orderNo);
    const env = paid
      ? this.envelope<StatusData>("order status", "OK", {
          order_no: orderNo,
          pnr: paid.pnr,
          ticket_numbers: paid.tickets,
          ticketing_status: "ticketed",
        })
      : this.envelope<StatusData>("order status", "ORDER_NOT_FOUND", null, "Unknown or unpaid order");
    this.record("order status", env.request_id, `${orderNo} -> ${env.code}`);
    return env;
  }
}
