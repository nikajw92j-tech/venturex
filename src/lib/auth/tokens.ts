import "server-only";
import type { TokenType } from "@prisma/client";
import { db } from "../db";
import { randomToken, sha256 } from "./session";

const TTL: Record<TokenType, number> = {
  EMAIL_VERIFY: 48 * 3600_000,
  PASSWORD_RESET: 60 * 60_000,
};

export async function issueToken(userId: string, type: TokenType) {
  // One live token per type: invalidate older ones.
  await db.authToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } });
  const token = randomToken();
  await db.authToken.create({
    data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + TTL[type]) },
  });
  return token;
}

/** Atomically consumes a token. Returns the userId or null when invalid/expired/used. */
export async function consumeToken(token: string, type: TokenType) {
  const row = await db.authToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.type !== type || row.usedAt || row.expiresAt < new Date()) return null;
  const res = await db.authToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  return res.count === 1 ? row.userId : null;
}

export async function peekToken(token: string, type: TokenType) {
  const row = await db.authToken.findUnique({ where: { tokenHash: sha256(token) } });
  return Boolean(row && row.type === type && !row.usedAt && row.expiresAt > new Date());
}
