"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { run, type ActionResult } from "@/lib/action";
import { enforceRateLimit } from "@/lib/ratelimit";
import { clientIp } from "@/lib/audit";
import { emailLayout, sendEmail } from "@/lib/email";
import { getSettings } from "@/lib/settings";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  subject: z.string().trim().min(3).max(120),
  body: z.string().trim().min(10, "Please write a little more").max(5000),
});

export async function contactAction(_: unknown, form: FormData): Promise<ActionResult> {
  return run(async () => {
    await enforceRateLimit(`contact:${await clientIp()}`, 5, 3600);
    if (form.get("website")) return; // honeypot: silently accept bots
    const v = schema.parse(Object.fromEntries(form));
    await db.contactMessage.create({ data: v });
    const { supportEmail } = await getSettings();
    await sendEmail(supportEmail, `[Contact] ${v.subject}`, emailLayout({ title: v.subject, body: `From: ${v.name} <${v.email}>\n\n${v.body}` })).catch(() => {});
  });
}
