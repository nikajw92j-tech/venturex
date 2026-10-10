import "server-only";
import bcrypt from "bcryptjs";

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

// Used to keep timing roughly constant when the account does not exist.
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEeO5pO5c9dS4ycH6U1N6rN9bG2Ad3b8Zt6";
export async function fakeVerify() {
  await bcrypt.compare("not-a-real-password", DUMMY_HASH);
}
