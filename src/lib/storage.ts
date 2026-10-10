import "server-only";
import { UserError } from "./errors";
import { promises as fs } from "node:fs";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { fileTypeFromBuffer } from "file-type";
import { env, isProd } from "./env";
import { randomToken } from "./auth/session";

const LOCAL_DIR = path.resolve(process.cwd(), "storage");

export const UPLOAD_RULES = {
  image: { mimes: ["image/png", "image/jpeg", "image/webp", "image/gif"], maxBytes: 8 * 1024 * 1024 },
  document: {
    mimes: [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/webp",
      "text/csv",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    maxBytes: 20 * 1024 * 1024,
  },
} as const;
export type UploadKind = keyof typeof UPLOAD_RULES;

let s3: S3Client | null = null;
function s3Client() {
  if (!env.s3.bucket) return null;
  s3 ??= new S3Client({
    region: env.s3.region,
    endpoint: env.s3.endpoint || undefined,
    forcePathStyle: Boolean(env.s3.endpoint),
    credentials: env.s3.accessKeyId
      ? { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey }
      : undefined,
  });
  return s3;
}

export class UploadError extends UserError {}

/**
 * Validates by sniffing magic bytes (never trusting the client-supplied type),
 * enforces size limits and returns the detected MIME type.
 */
export async function validateUpload(buf: Buffer, kind: UploadKind, declaredName: string) {
  const rule = UPLOAD_RULES[kind];
  if (buf.length === 0) throw new UploadError("Empty file");
  if (buf.length > rule.maxBytes) throw new UploadError(`File too large (max ${rule.maxBytes / 1024 / 1024} MB)`);
  const detected = await fileTypeFromBuffer(buf);
  let mime = detected?.mime as string | undefined;
  // CSV has no magic bytes: accept only if the name says .csv and content is printable text.
  if (!mime && /\.csv$/i.test(declaredName) && !buf.subarray(0, 4096).some((b) => b === 0)) mime = "text/csv";
  // DOCX/XLSX are zip containers; file-type reports their specific mime when recognizable.
  if (!mime || !(rule.mimes as readonly string[]).includes(mime)) {
    throw new UploadError("Unsupported file type");
  }
  return mime;
}

export async function putObject(buf: Buffer, mime: string, prefix: string) {
  const ext = mime.split("/")[1]?.replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
  const key = `${prefix}/${new Date().toISOString().slice(0, 7)}/${randomToken(18)}.${ext}`;
  const client = s3Client();
  if (client) {
    await client.send(new PutObjectCommand({ Bucket: env.s3.bucket, Key: key, Body: buf, ContentType: mime }));
  } else {
    if (isProd) throw new UploadError("File storage is not configured (S3_BUCKET).");
    const full = path.join(LOCAL_DIR, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, buf);
  }
  return key;
}

/** Streams/reads an object for the access-controlled /api/files route. */
export async function readObject(key: string): Promise<{ body: Buffer } | { redirect: string }> {
  const client = s3Client();
  if (client) {
    const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: env.s3.bucket, Key: key }), { expiresIn: 300 });
    return { redirect: url };
  }
  const full = path.join(LOCAL_DIR, key);
  if (!full.startsWith(LOCAL_DIR)) throw new Error("Invalid key");
  return { body: await fs.readFile(full) };
}
