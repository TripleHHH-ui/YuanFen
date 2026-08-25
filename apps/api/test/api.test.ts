import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../src/server.js";
import { resetTaste } from "../src/agents/taste_agent.js";
import { resetTrips } from "../src/agents/route_agent.js";
import { resetBookings } from "../src/booking.js";
import { clearEvidence } from "../src/evidence.js";

const PASSENGERS = [
  {
    full_name: "TEST/TRAVELER",
    gender: "Male",
    date_of_birth: "1990-01-01",
    nationality: "JP",
    document_type: "Passport",
    document_number: "TR0000001",
    issuing_country: "JP",
    expiry_date: "2032-12-31",
    contact_name: "TEST/TRAVELER",
  },
];

let app: FastifyInstance;

beforeAll(async () => {
  app = buildServer();
  await app.ready();
});

async function seedAndSwipe() {
  await app.inject({
    method: "POST",
    url: "/api/taste/seed",
    payload: { tags: ["food", "chill", "culture", "history", "views"] },
  });
  const deck = (await app.inject({ method: "GET", url: "/api/taste/deck" })).json();
  for (const card of deck.cards.slice(0, 5)) {
    await app.inject({ method: "POST", url: "/api/taste/swipe", payload: { cardId: card.id, action: "like" } });
  }
}

describe("golden path API", () => {
  beforeEach(() => {
    resetTaste();
    resetTrips();
    resetBookings();
    clearEvidence();
  });

  it("gates seeding on 5+ vibes (FR-002)", async () => {
    const res = await app.inject({ method: "POST", url: "/api/taste/seed", payload: { tags: ["food", "chill"] } });
    expect(res.statusCode).toBe(400);
  });

  it("S1: chat phrase returns a CBD day plan with chicken rice and a quiet closer", async () => {
    await seedAndSwipe();
    const res = await app.inject({
      method: "POST",
      url: "/api/plan/chat",
      payload: { text: "Day trip in Singapore CBD, must eat chicken rice, then somewhere quiet", date: "2026-09-05" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.alternatives.length).toBeGreaterThanOrEqual(2);
    const names: string[] = body.alternatives[0].stops.map((s: { place: { name: string } }) => s.place.name.toLowerCase());
    expect(names.some((n) => n.includes("maxwell") || n.includes("chicken rice") || n.includes("chinatown complex"))).toBe(true);
    expect(body.narration.trim().match(/[.!?]/g)?.length).toBe(1);
    const sealed = body.alternatives[0].stops.filter((s: { sealed?: boolean }) => s.sealed);
    expect(sealed.length).toBe(1);
    expect(sealed[0].place.name).toBe("???");
  });

  it("S3: alert returns a 3-card hand plus a sealed wildcard (FR-008/009)", async () => {
    await seedAndSwipe();
    const res = await app.inject({ method: "GET", url: "/api/fareboard/alert" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.weekend.holiday).toBe("Deepavali");
    expect(body.hand.top.length).toBe(3);
    expect(body.hand.wildcard.sealed).toBe(true);
    expect(body.mode).toBe("fixture");
    for (const deal of body.hand.top) {
      expect(deal.totalWithBag).toBe(deal.offer.price.base + deal.offer.bags.checked_fee);
    }
  });

  it("S3 -> trip: a deal expands into a full TripGraph with flight options", async () => {
    await seedAndSwipe();
    const res = await app.inject({ method: "POST", url: "/api/trips", payload: { destination: "DAD" } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.graph.days.length).toBeGreaterThanOrEqual(3);
    expect(body.flightOptions.length).toBeGreaterThanOrEqual(2);
    expect(body.graph.budget.total).toBe(body.graph.budget.flightTotal + body.graph.budget.ground);
  });

  it("S4: swapping the flight reflows day one with delta and one narration line (FR-013/014)", async () => {
    await seedAndSwipe();
    const trip = (await app.inject({ method: "POST", url: "/api/trips", payload: { destination: "DAD" } })).json();
    const current = trip.graph.flight.out.offer_id;
    const other = trip.flightOptions.find((o: { offer_id: string }) => o.offer_id !== current);
    const res = await app.inject({
      method: "POST",
      url: `/api/trips/${trip.graph.id}/swap-flight`,
      payload: { offer_id: other.offer_id },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.delta.fareDelta).not.toBe(0);
    expect(body.narration).toContain("day one");
    expect(body.narration.trim().match(/[.!?]/g)?.length).toBe(1);
  });

  it("booking: verify -> order -> pay returns order/PNR/ticket; wrong consent total is rejected (FR-015/016)", async () => {
    await seedAndSwipe();
    const verify = (await app.inject({ method: "POST", url: "/api/booking/verify", payload: { offer_id: "fxo-tr318-1106" } })).json();
    expect(verify.total).toBe(180);
    const order = (
      await app.inject({
        method: "POST",
        url: "/api/booking/order",
        payload: { booking_id: verify.booking_id, passengers: PASSENGERS },
      })
    ).json();
    expect(order.summary.passenger_masked).not.toContain("TRAVELER");

    const bad = await app.inject({
      method: "POST",
      url: "/api/booking/pay",
      payload: { confirmation_id: order.confirmation_id, approved_total: 999 },
    });
    expect(bad.statusCode).toBe(409);

    const pay = (
      await app.inject({
        method: "POST",
        url: "/api/booking/pay",
        payload: { confirmation_id: order.confirmation_id, approved_total: order.summary.total },
      })
    ).json();
    expect(pay.order_no).toMatch(/^FXORD-/);
    expect(pay.pnr).toHaveLength(6);
    expect(pay.ticket_numbers.length).toBe(1);
    expect(pay.mode).toBe("fixture");
  });

  it("evidence log lists atlas calls and never passenger details (FR-018)", async () => {
    await seedAndSwipe();
    await app.inject({ method: "GET", url: "/api/fareboard/alert" });
    const verify = (await app.inject({ method: "POST", url: "/api/booking/verify", payload: { offer_id: "fxo-tr318-1106" } })).json();
    await app.inject({
      method: "POST",
      url: "/api/booking/order",
      payload: { booking_id: verify.booking_id, passengers: PASSENGERS },
    });
    const res = (await app.inject({ method: "GET", url: "/api/evidence" })).json();
    expect(res.calls.length).toBeGreaterThan(0);
    expect(res.calls[0].request_id).toBeTruthy();
    expect(JSON.stringify(res.calls)).not.toContain("TRAVELER");
  });
});
