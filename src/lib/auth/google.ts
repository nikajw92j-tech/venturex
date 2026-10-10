import "server-only";
import { Google } from "arctic";
import { env } from "../env";

export function google() {
  return new Google(env.google.clientId, env.google.clientSecret, `${env.appUrl}/api/auth/google/callback`);
}
