import "server-only";
import { EventEmitter } from "node:events";
import { Client } from "pg";
import { db, type Tx } from "./db";

/**
 * Real-time fan-out using PostgreSQL LISTEN/NOTIFY.
 * Every app instance listens on one channel; events published from any instance
 * (inside or outside a DB transaction) reach SSE subscribers on all instances.
 * NOTIFY issued inside a transaction is delivered only after COMMIT, so clients
 * never see an event for state that was rolled back.
 */

const PG_CHANNEL = "vx_events";

export type RealtimeEvent = { type: string; [k: string]: unknown };

export async function publish(channel: string, event: RealtimeEvent, tx: Tx = db) {
  const payload = JSON.stringify({ c: channel, e: event });
  if (payload.length > 7500) throw new Error("Realtime payload too large");
  await tx.$executeRaw`SELECT pg_notify(${PG_CHANNEL}, ${payload})`;
}

type Hub = { emitter: EventEmitter; client: Client | null; connecting: Promise<void> | null };
const g = globalThis as unknown as { __vxHub?: Hub };

function hub(): Hub {
  if (!g.__vxHub) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0);
    g.__vxHub = { emitter, client: null, connecting: null };
  }
  return g.__vxHub;
}

async function ensureListener() {
  const h = hub();
  if (h.client) return;
  if (h.connecting) return h.connecting;
  h.connecting = (async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    client.on("notification", (msg) => {
      if (!msg.payload) return;
      try {
        const { c, e } = JSON.parse(msg.payload) as { c: string; e: RealtimeEvent };
        h.emitter.emit(c, e);
      } catch {
        /* ignore malformed payloads */
      }
    });
    const reset = () => {
      h.client = null;
      client.removeAllListeners();
      client.end().catch(() => {});
    };
    client.on("error", reset);
    client.on("end", reset);
    await client.connect();
    await client.query(`LISTEN ${PG_CHANNEL}`);
    h.client = client;
  })().finally(() => {
    h.connecting = null;
  });
  return h.connecting;
}

export async function subscribe(channels: string[], onEvent: (channel: string, e: RealtimeEvent) => void) {
  await ensureListener();
  const h = hub();
  const handlers = channels.map((c) => {
    const fn = (e: RealtimeEvent) => onEvent(c, e);
    h.emitter.on(c, fn);
    return [c, fn] as const;
  });
  return () => {
    for (const [c, fn] of handlers) h.emitter.off(c, fn);
  };
}
