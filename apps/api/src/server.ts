import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { createAtlasClient } from "./atlas/index.js";
import type { AtlasClient } from "./atlas/types.js";
import { REPO_ROOT } from "./data.js";
import { registerRoutes } from "./routes.js";

export function buildServer(client?: AtlasClient): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(cors, { origin: true });
  registerRoutes(app, client ?? createAtlasClient(REPO_ROOT));
  return app;
}

const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("src/server.ts");
if (isMain) {
  const port = Number(process.env.API_PORT ?? 8787);
  buildServer()
    .listen({ port, host: "0.0.0.0" })
    .then(() => console.log(`YuanFen api on :${port} (ATLAS_MODE=${process.env.ATLAS_MODE ?? "fixture"})`))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
