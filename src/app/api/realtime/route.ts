import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { subscribe } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Only lets a client listen to channels it is entitled to. */
async function authorize(channels: string[], userId: string | null) {
  const allowed: string[] = [];
  for (const ch of channels.slice(0, 20)) {
    const [kind, id] = ch.split(":");
    if (!id || !/^[a-z0-9]+$/i.test(id)) continue;
    if (kind === "auction") allowed.push(ch);
    else if (kind === "user" && userId === id) allowed.push(ch);
    else if (kind === "deal" && userId) {
      const d = await db.deal.findFirst({ where: { id, OR: [{ buyerId: userId }, { sellerId: userId }] }, select: { id: true } });
      if (d) allowed.push(ch);
    } else if (kind === "conversation" && userId) {
      const p = await db.conversationParticipant.findFirst({ where: { conversationId: id, userId }, select: { id: true } });
      if (p) allowed.push(ch);
    }
  }
  return allowed;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const requested = (req.nextUrl.searchParams.get("channels") ?? "").split(",").filter(Boolean);
  const channels = await authorize(requested, user?.id ?? null);
  if (!channels.length) return new Response("No channels", { status: 403 });

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (s: string) => {
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          /* closed */
        }
      };
      send(`retry: 3000\n\n`);
      cleanup = await subscribe(channels, (channel, event) => {
        send(`data: ${JSON.stringify({ channel, event })}\n\n`);
      });
      heartbeat = setInterval(() => send(`: ping\n\n`), 25000);
      req.signal.addEventListener("abort", () => {
        cleanup?.();
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      cleanup?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
