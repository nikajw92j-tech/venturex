// Background scheduler for self-hosted deployments. Calls the cron endpoint
// every 30 seconds (auction settlement, ending-soon alerts, payment expiry,
// promotion expiry, email outbox, exchange rates).
//   APP_URL=https://your.site CRON_SECRET=... node scripts/worker.mjs
const url = `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/api/cron/tick`;
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("CRON_SECRET is required");
  process.exit(1);
}
async function tick() {
  try {
    const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${secret}` } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) console.error(`[worker] ${res.status}`, body);
    else if (Object.values(body.result ?? {}).some((v) => typeof v === "number" && v > 0)) console.log("[worker]", new Date().toISOString(), body.result);
  } catch (e) {
    console.error("[worker] tick failed:", e.message);
  }
}
await tick();
setInterval(tick, 30_000);
