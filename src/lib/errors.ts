/** Errors whose message is safe to show to end users. */
export class UserError extends Error {
  readonly expose = true;
}
