import "server-only";
import { ZodError } from "zod";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { UserError } from "./errors";

export { UserError };

export type ActionResult<T = void> = { ok: true; data?: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Wraps a server action body: validation and domain errors become friendly
 * messages, unexpected errors are logged and hidden from the client.
 */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    if (e instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
      return { ok: false, error: e.issues[0]?.message ?? "Invalid input", fieldErrors };
    }
    if (e instanceof UserError) return { ok: false, error: e.message };
    console.error("[action]", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
