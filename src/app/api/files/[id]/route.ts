import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { readObject } from "@/lib/storage";

export const runtime = "nodejs";

/** Private files are served only to people with a legitimate reason to see them. */
async function canRead(fileId: string, ownerId: string, userId: string | null, isAdmin: boolean) {
  if (!userId) return false;
  if (isAdmin || ownerId === userId) return true;
  const [media, msg, dispute] = await Promise.all([
    db.listingMedia.findFirst({ where: { fileId }, select: { listingId: true } }),
    db.message.findFirst({ where: { attachmentId: fileId }, select: { conversationId: true } }),
    db.disputeMessage.findFirst({ where: { fileId }, select: { dispute: { select: { deal: { select: { buyerId: true, sellerId: true } } } } } }),
  ]);
  if (media) {
    const access = await db.documentAccess.findUnique({ where: { listingId_buyerId: { listingId: media.listingId, buyerId: userId } } });
    if (access?.status === "GRANTED" && access.ndaAcceptedAt) return true;
  }
  if (msg) {
    const p = await db.conversationParticipant.findFirst({ where: { conversationId: msg.conversationId, userId } });
    if (p) return true;
  }
  if (dispute) {
    const d = dispute.dispute.deal;
    if (d.buyerId === userId || d.sellerId === userId) return true;
  }
  return false;
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const file = await db.storedFile.findUnique({ where: { id } });
  if (!file) return new NextResponse("Not found", { status: 404 });

  if (file.visibility === "PRIVATE") {
    const user = await getCurrentUser();
    if (!(await canRead(file.id, file.ownerId, user?.id ?? null, user?.role === "ADMIN"))) {
      return new NextResponse("Not found", { status: 404 });
    }
  }

  const obj = await readObject(file.storageKey);
  if ("redirect" in obj) return NextResponse.redirect(obj.redirect, 302);
  const inline = file.mimeType.startsWith("image/") || file.mimeType === "application/pdf";
  return new NextResponse(new Uint8Array(obj.body), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(file.filename)}"`,
      "Cache-Control": file.visibility === "PUBLIC" ? "public, max-age=31536000, immutable" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
