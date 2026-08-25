import { execFile } from "node:child_process";
import { promisify } from "node:util";
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

const execFileAsync = promisify(execFile);

/**
 * Shells out to the official `atlas-flight` CLI (Sandbox), per the published
 * CLI contract: exact commands only, one JSON envelope per call, IDs opaque.
 * Requires prior browser authorization (`atlas-flight auth login`) and
 * `atlas-flight environment use sandbox` — see the Atlas Skill user guide.
 * NOT exercised in local-first development (no CLI/credentials on this
 * machine); the fixture client covers that path. Passenger details go over
 * stdin one-time and are never logged.
 */
export class CliAtlasClient implements AtlasClient {
  readonly mode = "cli" as const;
  readonly environment = "sandbox";

  private async run<T>(op: string, args: string[], stdin?: string): Promise<Envelope<T>> {
    try {
      const child = execFile("atlas-flight", [...args, "--json"], { timeout: 120_000 });
      if (stdin && child.stdin) {
        child.stdin.write(stdin);
        child.stdin.end();
      }
      const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
        let out = "";
        let err = "";
        child.stdout?.on("data", (d) => (out += d));
        child.stderr?.on("data", (d) => (err += d));
        child.on("error", reject);
        child.on("close", (code) =>
          code === 0 || out.length > 0 ? resolve({ stdout: out }) : reject(new Error(err || `exit ${code}`)),
        );
      });
      const env = JSON.parse(stdout) as Envelope<T>;
      recordEvidence({
        request_id: env.request_id,
        ts: new Date().toISOString(),
        op,
        env: this.environment,
        mode: this.mode,
        summary: `${op} -> ${env.code}`,
      });
      return env;
    } catch (err) {
      const fallback: Envelope<T> = {
        schema_version: "1",
        status: "error",
        code: "CLI_UNAVAILABLE",
        message: err instanceof Error ? err.message : String(err),
        retryable: false,
        request_id: `cli-err-${Date.now()}`,
        data: null,
        details: null,
      };
      recordEvidence({
        request_id: fallback.request_id,
        ts: new Date().toISOString(),
        op,
        env: this.environment,
        mode: this.mode,
        summary: `${op} -> CLI_UNAVAILABLE`,
      });
      return fallback;
    }
  }

  search(params: SearchParams): Promise<Envelope<SearchData>> {
    return this.run<SearchData>("search", [
      "search",
      "--origin",
      params.origin,
      "--destination",
      params.destination,
      "--depart",
      params.depart,
      "--adults",
      String(params.adults),
    ]);
  }

  offerVerify(offerId: string): Promise<Envelope<VerifyData>> {
    return this.run<VerifyData>("offer verify", ["offer", "verify", "--offer-id", offerId]);
  }

  orderCreate(bookingId: string, passengers: PassengerInput[]): Promise<Envelope<OrderData>> {
    return this.run<OrderData>(
      "order create",
      ["order", "create", "--booking-id", bookingId, "--passengers-stdin"],
      JSON.stringify(passengers),
    );
  }

  orderPay(confirmationId: string): Promise<Envelope<PayData>> {
    return this.run<PayData>("order pay", ["order", "pay", "--confirmation-id", confirmationId]);
  }

  orderStatus(orderNo: string): Promise<Envelope<StatusData>> {
    return this.run<StatusData>("order status", ["order", "status", "--order-no", orderNo]);
  }
}
