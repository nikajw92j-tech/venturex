import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { getSettings } from "@/lib/settings";
import { ContactForm } from "@/components/contact-form";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Contact", alternates: { canonical: "/contact" } };

export default async function ContactPage() {
  const settings = await getSettings();
  return (
    <div className="container-x grid max-w-5xl gap-10 py-16 md:grid-cols-[1fr_1.3fr]">
      <div>
        <h1 className="font-display text-4xl font-semibold text-white sm:text-5xl">Contact us</h1>
        <p className="mt-4 text-slate-400">Questions about a listing, a transaction or your account? Our team usually replies within one business day.</p>
        <a href={`mailto:${settings.supportEmail}`} className="mt-6 inline-flex items-center gap-2 text-electric-400 hover:underline"><Mail className="h-4 w-4" /> {settings.supportEmail}</a>
      </div>
      <Card className="p-6 sm:p-8"><ContactForm /></Card>
    </div>
  );
}
