import type { FastifyInstance } from "fastify";
import { VIBE_TAGS, type SwipeAction, type VibeTag } from "@yuanfen/shared";
import type { AtlasClient, PassengerInput } from "./atlas/types.js";
import { evidenceLog } from "./evidence.js";
import { acceptPriceChange, createOrder, payOrder, verifyOffer } from "./booking.js";
import { getAlert } from "./agents/fare_board.js";
import { createTripFromDeal, planChat, swapFlight, tripView } from "./agents/route_agent.js";
import { seedTaste, swipe, tasteDeck, tasteSummary, undo } from "./agents/taste_agent.js";

export function registerRoutes(app: FastifyInstance, client: AtlasClient): void {
  app.get("/api/meta/vibes", async () => ({ tags: VIBE_TAGS, min: 5 }));
  app.get("/api/meta/mode", async () => ({ mode: client.mode, environment: client.environment }));

  app.get("/api/taste/deck", async () => ({ cards: tasteDeck() }));

  app.post<{ Body: { tags: VibeTag[] } }>("/api/taste/seed", async (req, reply) => {
    const result = seedTaste(req.body?.tags ?? []);
    if (!result.ok) return reply.code(400).send({ error: result.error });
    return { ok: true, summary: tasteSummary() };
  });

  app.post<{ Body: { cardId: string; action: SwipeAction } }>("/api/taste/swipe", async (req, reply) => {
    const result = swipe(req.body?.cardId ?? "", req.body?.action ?? "like");
    if ("error" in result) return reply.code(400).send(result);
    return { done: result.done, summary: tasteSummary() };
  });

  app.post("/api/taste/undo", async (_req, reply) => {
    const result = undo();
    if ("error" in result) return reply.code(400).send(result);
    return { summary: tasteSummary() };
  });

  app.get("/api/taste/vector", async (_req, reply) => {
    const summary = tasteSummary();
    if (!summary) return reply.code(404).send({ error: "Not seeded" });
    return summary;
  });

  app.post<{ Body: { text: string; date?: string } }>("/api/plan/chat", async (req, reply) => {
    const summary = tasteSummary();
    if (!summary) return reply.code(400).send({ error: "Seed taste first" });
    return planChat(req.body?.text ?? "", summary.vector, req.body?.date);
  });

  app.get("/api/fareboard/alert", async (_req, reply) => {
    const summary = tasteSummary();
    if (!summary) return reply.code(400).send({ error: "Seed taste first" });
    return getAlert(summary.vector, client);
  });

  app.post<{ Body: { destination: string } }>("/api/trips", async (req, reply) => {
    const summary = tasteSummary();
    if (!summary) return reply.code(400).send({ error: "Seed taste first" });
    const result = await createTripFromDeal(req.body?.destination ?? "", summary.vector, client);
    if (result.error) return reply.code(400).send({ error: result.error });
    return result.trip;
  });

  app.get<{ Params: { id: string } }>("/api/trips/:id", async (req, reply) => {
    const view = tripView(req.params.id);
    if (!view) return reply.code(404).send({ error: "Unknown trip" });
    return view;
  });

  app.post<{ Params: { id: string }; Body: { offer_id: string } }>(
    "/api/trips/:id/swap-flight",
    async (req, reply) => {
      const result = swapFlight(req.params.id, req.body?.offer_id ?? "");
      if ("error" in result) return reply.code(400).send(result);
      return result;
    },
  );

  app.post<{ Body: { offer_id: string } }>("/api/booking/verify", async (req, reply) => {
    const result = await verifyOffer(client, req.body?.offer_id ?? "");
    if ("error" in result) return reply.code(400).send(result);
    return result;
  });

  app.post<{ Body: { booking_id: string } }>("/api/booking/accept-price", async (req, reply) => {
    const result = acceptPriceChange(req.body?.booking_id ?? "");
    if ("error" in result) return reply.code(400).send(result);
    return result;
  });

  app.post<{ Body: { booking_id: string; passengers: PassengerInput[] } }>(
    "/api/booking/order",
    async (req, reply) => {
      const result = await createOrder(client, req.body?.booking_id ?? "", req.body?.passengers ?? []);
      if ("error" in result) return reply.code(400).send(result);
      return result;
    },
  );

  app.post<{ Body: { confirmation_id: string; approved_total: number } }>(
    "/api/booking/pay",
    async (req, reply) => {
      const result = await payOrder(client, req.body?.confirmation_id ?? "", req.body?.approved_total ?? -1);
      if ("error" in result) return reply.code(409).send(result);
      return result;
    },
  );

  app.get("/api/evidence", async () => ({ mode: client.mode, environment: client.environment, calls: evidenceLog() }));
}
