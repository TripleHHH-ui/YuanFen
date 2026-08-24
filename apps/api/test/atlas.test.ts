import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { FixtureAtlasClient } from "../src/atlas/fixture.js";
import { clearEvidence, evidenceLog } from "../src/evidence.js";
import { REPO_ROOT } from "../src/data.js";

const FIXTURES = path.join(REPO_ROOT, "data", "fares", "fixtures", "searches.json");

const PASSENGER = {
  full_name: "TEST/TRAVELER",
  gender: "Male",
  date_of_birth: "1990-01-01",
  nationality: "JP",
  document_type: "Passport",
  document_number: "TR0000001",
  issuing_country: "JP",
  expiry_date: "2032-12-31",
  contact_name: "TEST/TRAVELER",
};

describe("FixtureAtlasClient", () => {
  beforeEach(() => clearEvidence());

  it("serves fixture offers in the CLI envelope shape", async () => {
    const client = new FixtureAtlasClient(FIXTURES);
    const env = await client.search({ origin: "SIN", destination: "DAD", depart: "2026-11-06", adults: 1 });
    expect(env.status).toBe("ok");
    expect(env.schema_version).toBe("1");
    expect(env.data!.offers.length).toBeGreaterThanOrEqual(2);
    expect(env.data!.offers[0]!.price_status).toBe("current");
  });

  it("records every call in the evidence log (FR-018)", async () => {
    const client = new FixtureAtlasClient(FIXTURES);
    await client.search({ origin: "SIN", destination: "DAD", depart: "2026-11-06", adults: 1 });
    await client.offerVerify("fxo-tr318-1106");
    const log = evidenceLog();
    expect(log.length).toBe(2);
    expect(log[0]!.mode).toBe("fixture");
    expect(log[0]!.request_id).toBeTruthy();
  });

  it("full booking flow returns order/pnr/ticket and keeps passenger details out of evidence", async () => {
    const client = new FixtureAtlasClient(FIXTURES);
    const verify = await client.offerVerify("fxo-tr318-1106");
    const order = await client.orderCreate(verify.data!.booking_id, [PASSENGER]);
    expect(order.status).toBe("ok");
    expect(order.data!.summary.passenger_masked).not.toContain("TRAVELER");
    const pay = await client.orderPay(order.data!.payment_confirmation_id);
    expect(pay.status).toBe("ok");
    const status = await client.orderStatus(pay.data!.order_no);
    expect(status.data!.pnr).toHaveLength(6);
    expect(status.data!.ticket_numbers.length).toBe(1);
    expect(JSON.stringify(evidenceLog())).not.toContain("TRAVELER");
  });

  it("payment confirmation ids are single-use", async () => {
    const client = new FixtureAtlasClient(FIXTURES);
    const verify = await client.offerVerify("fxo-tr318-1106");
    const order = await client.orderCreate(verify.data!.booking_id, [PASSENGER]);
    const first = await client.orderPay(order.data!.payment_confirmation_id);
    expect(first.status).toBe("ok");
    const second = await client.orderPay(order.data!.payment_confirmation_id);
    expect(second.code).toBe("CONFIRMATION_USED");
  });

  it("simulates a price increase when configured", async () => {
    const client = new FixtureAtlasClient(FIXTURES, { priceBumpOfferIds: ["fxo-tr318-1106"] });
    const env = await client.offerVerify("fxo-tr318-1106");
    expect(env.data!.price_changed).toBe(true);
    expect(env.data!.verified_total_with_bag).toBe(180 + 18);
    expect(env.data!.previous_total_with_bag).toBe(180);
  });
});
