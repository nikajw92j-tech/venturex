import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { putObject, UploadError, validateUpload, type UploadKind } from "@/lib/storage";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

// purpose → (validation kind, visibility)
const PURPOSES: Record<string, { kind: UploadKind; visibility: "PUBLIC" | "PRIVATE" }> = {
  "listing-image": { kind: "image", visibility: "PUBLIC" },
  avatar: { kind: "image", visibility: "PUBLIC" },
  evidence: { kind: "document", visibility: "PRIVATE" },
  message: { kind: "document", visibility: "PRIVATE" },
  dispute: { kind: "document", visibility: "PRIVATE" },
  verification: { kind: "document", visibility: "PRIVATE" },
};

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  if (!(await rateLimit(`upload:${user.id}`, 60, 3600))) return NextResponse.json({ error: "Upload limit reached, try again later" }, { status: 429 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const purpose = String(form?.get("purpose") ?? "");
  const rule = PURPOSES[purpose];
  if (!rule || !(file instanceof File)) return NextResponse.json({ error: "Invalid upload" }, { status: 400 });

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const mime = await validateUpload(buf, rule.kind, file.name);
    const key = await putObject(buf, mime, `${rule.visibility === "PUBLIC" ? "public" : "private"}/${purpose}`);
    const stored = await db.storedFile.create({
      data: {
        ownerId: user.id,
        storageKey: key,
        filename: file.name.replace(/[^\w.\- ()]/g, "_").slice(0, 120) || "file",
        mimeType: mime,
        size: buf.length,
        visibility: rule.visibility,
      },
    });
    if (purpose === "avatar") await db.user.update({ where: { id: user.id }, data: { avatarUrl: `/api/files/${stored.id}` } });
    return NextResponse.json({ id: stored.id, url: `/api/files/${stored.id}`, name: stored.filename, mime, size: buf.length });
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[upload]", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
