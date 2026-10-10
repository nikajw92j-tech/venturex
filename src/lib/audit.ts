import "server-only";
import { headers } from "next/headers";
import { db, type Tx } from "./db";

export async function clientIp(): Promise<string | null> {
  try {
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  } catch {
    return null;
  }
}

export async function audit(
  entry: { actorId?: string | null; action: string; entityType: string; entityId: string; data?: unknown },
  tx: Tx = db,
) {
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      data: (entry.data ?? undefined) as never,
      ip: await clientIp(),
    },
  });
}
