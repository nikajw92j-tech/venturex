"use client";

import Link from "next/link";
import { useActionState } from "react";
import { motion } from "framer-motion";
import { loginAction, registerAction, requestPasswordResetAction, resetPasswordAction } from "@/app/actions/auth";
import { Alert, Button, Field } from "../ui";
import { useT } from "@/i18n/client";
import { COUNTRIES } from "@/lib/categories";
import type { ActionResult } from "@/lib/action";

function GoogleButton({ enabled, next }: { enabled: boolean; next?: string }) {
  const t = useT();
  if (!enabled) return null;
  return (
    <>
      <a href={`/api/auth/google${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="flex h-11 w-full items-center justify-center gap-3 rounded-xl bg-white text-sm font-semibold text-slate-900 transition hover:bg-slate-100">
        <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
        {t("auth.google")}
      </a>
      <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wider text-slate-500">
        <span className="h-px flex-1 bg-white/10" /> {t("auth.or")} <span className="h-px flex-1 bg-white/10" />
      </div>
    </>
  );
}

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-[calc(100vh-4rem)] place-items-center overflow-hidden px-4 py-16">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-electric/20 blur-[120px]" />
        <div className="absolute right-1/4 bottom-1/4 h-96 w-96 rounded-full bg-violet/20 blur-[120px]" />
        <div className="grid-bg absolute inset-0" />
      </div>
      <motion.div initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} className="glass-strong card-shadow relative w-full max-w-md rounded-3xl p-7 sm:p-9">
        <h1 className="font-display text-2xl font-semibold text-white">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-slate-400">{subtitle}</p>}
        <div className="mt-7">{children}</div>
      </motion.div>
    </div>
  );
}

function useForm(action: (s: unknown, f: FormData) => Promise<ActionResult>) {
  return useActionState<ActionResult | null, FormData>(action as never, null);
}

export function LoginForm({ google, next, notice }: { google: boolean; next?: string; notice?: string }) {
  const t = useT();
  const [state, formAction, pending] = useForm(loginAction);
  return (
    <>
      {notice && <Alert tone="green" className="mb-5">{notice}</Alert>}
      <GoogleButton enabled={google} next={next} />
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <Field label={t("auth.email")}><input name="email" type="email" autoComplete="email" required className="input" /></Field>
        <Field label={t("auth.password")}><input name="password" type="password" autoComplete="current-password" required className="input" /></Field>
        <div className="text-right"><Link href="/forgot-password" className="text-xs text-electric-400 hover:underline">{t("auth.forgot")}</Link></div>
        {state && !state.ok && <Alert tone="red">{state.error}</Alert>}
        <Button type="submit" className="w-full" size="lg" loading={pending}>{t("auth.signIn")}</Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-400">{t("auth.noAccount")} <Link href="/register" className="font-semibold text-white hover:underline">{t("nav.register")}</Link></p>
    </>
  );
}

export function RegisterForm({ google }: { google: boolean }) {
  const t = useT();
  const [state, formAction, pending] = useForm(registerAction);
  const fe = state && !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <>
      <GoogleButton enabled={google} />
      <form action={formAction} className="space-y-4">
        <Field label={t("auth.displayName")} error={fe.displayName}><input name="displayName" autoComplete="name" required className="input" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("auth.username")} error={fe.username}><input name="username" autoComplete="username" required pattern="[A-Za-z0-9_]{3,24}" className="input" /></Field>
          <Field label={t("auth.country")}>
            <select name="country" className="input">
              <option value="">—</option>
              {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label={t("auth.email")} error={fe.email}><input name="email" type="email" autoComplete="email" required className="input" /></Field>
        <Field label={t("auth.password")} error={fe.password} hint="10+ characters with letters and a number"><input name="password" type="password" autoComplete="new-password" required minLength={10} className="input" /></Field>
        {state && !state.ok && !Object.keys(fe).length && <Alert tone="red">{state.error}</Alert>}
        <Button type="submit" className="w-full" size="lg" loading={pending}>{t("auth.signUp")}</Button>
        <p className="text-center text-xs text-slate-500">{t("auth.terms")}</p>
      </form>
      <p className="mt-6 text-center text-sm text-slate-400">{t("auth.haveAccount")} <Link href="/login" className="font-semibold text-white hover:underline">{t("auth.signIn")}</Link></p>
    </>
  );
}

export function ForgotForm() {
  const t = useT();
  const [state, formAction, pending] = useForm(requestPasswordResetAction);
  if (state?.ok) return <Alert tone="green">{t("auth.resetSent")}</Alert>;
  return (
    <form action={formAction} className="space-y-4">
      <Field label={t("auth.email")}><input name="email" type="email" required className="input" /></Field>
      {state && !state.ok && <Alert tone="red">{state.error}</Alert>}
      <Button type="submit" className="w-full" size="lg" loading={pending}>{t("common.submit")}</Button>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const t = useT();
  const [state, formAction, pending] = useForm(resetPasswordAction);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field label={t("auth.newPassword")} hint="10+ characters with letters and a number"><input name="password" type="password" autoComplete="new-password" required minLength={10} className="input" /></Field>
      {state && !state.ok && <Alert tone="red">{state.error}</Alert>}
      <Button type="submit" className="w-full" size="lg" loading={pending}>{t("common.save")}</Button>
    </form>
  );
}
