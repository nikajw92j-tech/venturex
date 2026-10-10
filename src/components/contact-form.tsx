"use client";

import { useActionState } from "react";
import { contactAction } from "@/app/actions/contact";
import { Alert, Button, Field } from "./ui";

export function ContactForm() {
  const [state, action, pending] = useActionState(contactAction, null);
  if (state?.ok) return <Alert tone="green">Thanks! Your message was sent — we&apos;ll get back to you soon.</Alert>;
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name"><input name="name" required maxLength={80} className="input" /></Field>
        <Field label="Email"><input name="email" type="email" required className="input" /></Field>
      </div>
      <Field label="Subject"><input name="subject" required maxLength={120} className="input" /></Field>
      <Field label="Message"><textarea name="body" required minLength={10} maxLength={5000} className="input min-h-36" /></Field>
      {/* Honeypot: hidden from people, bots tend to fill it */}
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      {state && !state.ok && <Alert tone="red">{state.error}</Alert>}
      <Button type="submit" loading={pending} className="w-full" size="lg">Send message</Button>
    </form>
  );
}
