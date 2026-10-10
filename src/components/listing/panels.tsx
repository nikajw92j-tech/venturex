"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Expand, FileLock2, Flag, Heart, HandCoins, Lock, MessageSquare, ShieldCheck, ShoppingCart, X } from "lucide-react";
import { Button, buttonClass } from "../ui";
import { Modal } from "../modal";
import { useToast } from "../toast";
import { useMoney, useT, useLocale } from "@/i18n/client";
import { buyFixedAction, makeOfferAction } from "@/app/actions/trade";
import { contactSellerAction } from "@/app/actions/messages";
import { answerQuestionAction, askQuestionAction, reportAction, requestDocumentAccessAction, toggleWatchAction } from "@/app/actions/engagement";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import { cn, timeAgo } from "@/lib/utils";

// ───────────────────────────── Gallery ─────────────────────────────

export function Gallery({ images, title }: { images: string[]; title: string }) {
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  if (!images.length) {
    return (
      <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-ink-850 ring-1 ring-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(59,130,246,0.35),transparent_55%),radial-gradient(circle_at_75%_75%,rgba(139,92,246,0.35),transparent_55%)]" />
        <div className="grid-bg absolute inset-0" />
        <div className="absolute inset-0 grid place-items-center font-display text-3xl font-semibold text-white/80">{title}</div>
      </div>
    );
  }
  const go = (d: number) => setI((x) => (x + d + images.length) % images.length);
  return (
    <div>
      <div className="group relative aspect-[16/9] overflow-hidden rounded-2xl bg-ink-850 ring-1 ring-white/10">
        <AnimatePresence mode="wait">
          { }
          <motion.img key={images[i]} src={images[i]} alt={`${title} screenshot ${i + 1}`} initial={{ opacity: 0, scale: 1.03 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} className="h-full w-full object-cover" />
        </AnimatePresence>
        {images.length > 1 && (
          <>
            <button onClick={() => go(-1)} className="absolute top-1/2 left-3 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-ink-950/70 text-white opacity-0 backdrop-blur transition group-hover:opacity-100" aria-label="Previous image"><ChevronLeft className="h-5 w-5" /></button>
            <button onClick={() => go(1)} className="absolute top-1/2 right-3 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-ink-950/70 text-white opacity-0 backdrop-blur transition group-hover:opacity-100" aria-label="Next image"><ChevronRight className="h-5 w-5" /></button>
          </>
        )}
        <button onClick={() => setOpen(true)} className="absolute right-3 bottom-3 grid h-9 w-9 place-items-center rounded-full bg-ink-950/70 text-white backdrop-blur" aria-label="Fullscreen"><Expand className="h-4 w-4" /></button>
      </div>
      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.map((src, k) => (
            <button key={src} onClick={() => setI(k)} className={cn("h-16 w-24 shrink-0 overflow-hidden rounded-lg ring-2 transition", k === i ? "ring-electric-400" : "ring-transparent opacity-60 hover:opacity-100")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-[95] grid place-items-center bg-ink-950/95 p-4 backdrop-blur" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
            <button className="absolute top-4 right-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white" aria-label="Close"><X className="h-5 w-5" /></button>
            { }
            <motion.img src={images[i]} alt="" initial={{ scale: 0.92 }} animate={{ scale: 1 }} className="max-h-[88vh] max-w-full rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ───────────────────────────── Fixed price ─────────────────────────────

export function FixedPricePanel({ listingId, price, currency, available, isSeller, userId, emailVerified, slug }: { listingId: string; price: number; currency: CurrencyCode; available: boolean; isSeller: boolean; userId: string | null; emailVerified: boolean; slug: string }) {
  const t = useT();
  const locale = useLocale();
  const money = useMoney();
  const toast = useToast();
  const router = useRouter();
  const [modal, setModal] = useState<null | "buy" | "offer">(null);
  const [offer, setOffer] = useState(String(Math.round(price * 0.9) / 100));
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const m = money(price, currency);
  const priceStr = formatMoney(price, currency, { locale });

  return (
    <div className="glass-strong card-shadow rounded-2xl p-5">
      <div className="text-xs uppercase tracking-wider text-slate-400">{t("common.askingPrice")}</div>
      <div className="font-display text-4xl font-semibold text-white">{m.primary}</div>
      {m.converted && <div className="text-xs text-slate-500">{t("common.originalPrice")}: {m.original}</div>}
      <div className="mt-5 space-y-2.5">
        {isSeller ? (
          <Link href="/dashboard/listings" className={buttonClass("secondary", "lg", "w-full")}>{t("dash.listings")}</Link>
        ) : !userId ? (
          <Link href={`/login?next=/listing/${slug}`} className={buttonClass("primary", "lg", "w-full")}>{t("common.signInToContinue")}</Link>
        ) : available ? (
          <>
            <Button size="lg" className="w-full" onClick={() => setModal("buy")} disabled={!emailVerified}><ShoppingCart className="h-4 w-4" /> {t("listing.buyFor", { amount: priceStr })}</Button>
            <Button variant="secondary" size="lg" className="w-full" onClick={() => setModal("offer")} disabled={!emailVerified}><HandCoins className="h-4 w-4" /> {t("common.makeOffer")}</Button>
            {!emailVerified && <p className="text-xs text-amber-300">{t("auth.verifyBanner")}</p>}
          </>
        ) : (
          <div className="rounded-xl bg-white/[0.03] p-3 text-sm text-slate-400 ring-1 ring-white/5">{t("listing.pendingSale")}</div>
        )}
      </div>
      <div className="mt-4 flex items-start gap-2 text-xs text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> {t("home.how.3.body")}</div>

      <Modal open={modal === "buy"} onClose={() => setModal(null)} title={t("common.buyNow")}>
        <p className="text-slate-300">{t("listing.confirmBuy", { amount: priceStr })}</p>
        <div className="mt-6 flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setModal(null)}>{t("common.cancel")}</Button>
          <Button className="flex-1" loading={pending} onClick={() => start(async () => {
            const r = await buyFixedAction(listingId);
            if (!r.ok) return toast.error(r.error);
            router.push(`/dashboard/deals/${r.data!.dealId}?pay=1`);
          })}>{t("common.continue")}</Button>
        </div>
      </Modal>

      <Modal open={modal === "offer"} onClose={() => setModal(null)} title={t("common.makeOffer")}>
        <div className="space-y-4">
          <div>
            <label className="label">{t("listing.offerAmount")} ({currency})</label>
            <input type="number" inputMode="decimal" className="input h-12 text-lg font-semibold" value={offer} onChange={(e) => setOffer(e.target.value)} />
          </div>
          <div>
            <label className="label">{t("listing.offerMessage")}</label>
            <textarea className="input min-h-24" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} />
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setModal(null)}>{t("common.cancel")}</Button>
            <Button className="flex-1" loading={pending} onClick={() => start(async () => {
              const r = await makeOfferAction(listingId, Number(offer), message);
              if (!r.ok) return toast.error(r.error);
              toast.success(t("listing.offerSent"));
              setModal(null);
            })}>{t("common.submit")}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ───────────────────────────── Secondary actions ─────────────────────────────

export function ListingActions({ listingId, watching: initial, userId, isSeller }: { listingId: string; watching: boolean; userId: string | null; isSeller: boolean }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [watching, setWatching] = useState(initial);
  const [report, setReport] = useState(false);
  const [reason, setReason] = useState("Misleading information");
  const [details, setDetails] = useState("");
  const [pending, start] = useTransition();
  if (!userId) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {!isSeller && (
        <>
          <Button variant="secondary" size="sm" onClick={() => start(async () => {
            const r = await toggleWatchAction(listingId);
            if (r.ok) setWatching(r.data!.watching);
          })}>
            <motion.span animate={watching ? { scale: [1, 1.4, 1] } : {}}><Heart className={cn("h-4 w-4", watching && "fill-red-500 text-red-500")} /></motion.span>
            {watching ? t("listing.watching") : t("listing.watch")}
          </Button>
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => start(async () => {
            const r = await contactSellerAction(listingId);
            if (!r.ok) return toast.error(r.error);
            router.push(`/messages/${r.data!.conversationId}`);
          })}>
            <MessageSquare className="h-4 w-4" /> {t("common.contactSeller")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setReport(true)}><Flag className="h-4 w-4" /> {t("listing.report")}</Button>
        </>
      )}
      <Modal open={report} onClose={() => setReport(false)} title={t("listing.report")}>
        <div className="space-y-4">
          <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
            {["Misleading information", "Suspected fraud", "Stolen or infringing assets", "Spam", "Other"].map((r) => <option key={r}>{r}</option>)}
          </select>
          <textarea className="input min-h-24" placeholder="Details" value={details} onChange={(e) => setDetails(e.target.value)} />
          <Button className="w-full" loading={pending} onClick={() => start(async () => {
            const r = await reportAction({ targetType: "LISTING", targetId: listingId, reason, details });
            if (!r.ok) return toast.error(r.error);
            toast.success("Report submitted. Our trust & safety team will review it.");
            setReport(false);
          })}>{t("common.submit")}</Button>
        </div>
      </Modal>
    </div>
  );
}

// ───────────────────────────── Document room ─────────────────────────────

export function DocumentRoom({ listingId, status, docs, isSeller, userId }: { listingId: string; status: "NONE" | "REQUESTED" | "GRANTED" | "DENIED" | "REVOKED"; docs: { id: string; name: string; kind: string }[] | null; isSeller: boolean; userId: string | null }) {
  const t = useT();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [nda, setNda] = useState(false);
  const [state, setState] = useState(status);
  const [pending, start] = useTransition();
  return (
    <div>
      <p className="text-sm text-slate-400">{t("listing.documentsHelp")}</p>
      {docs ? (
        <ul className="mt-4 space-y-2">
          {docs.length === 0 && <li className="text-sm text-slate-500">{t("common.noResults")}</li>}
          {docs.map((d) => (
            <li key={d.id}>
              <a href={`/api/files/${d.id}`} target="_blank" rel="noopener" className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5 text-sm text-slate-200 ring-1 ring-white/5 transition hover:ring-electric/40">
                <FileLock2 className="h-4 w-4 text-electric-400" /> <span className="truncate">{d.name}</span> <span className="ml-auto text-xs text-slate-500">{d.kind.replace("_", " ").toLowerCase()}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : isSeller ? null : (
        <div className="mt-4">
          {state === "REQUESTED" ? (
            <div className="flex items-center gap-2 text-sm text-amber-300"><Lock className="h-4 w-4" /> {t("listing.accessRequested")}</div>
          ) : state === "DENIED" || state === "REVOKED" ? (
            <div className="text-sm text-slate-500">Access not granted.</div>
          ) : userId ? (
            <Button variant="outline" onClick={() => setOpen(true)}><Lock className="h-4 w-4" /> {t("listing.requestAccess")}</Button>
          ) : (
            <Link href="/login" className={buttonClass("outline")}>{t("common.signInToContinue")}</Link>
          )}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={t("listing.documents")}>
        <div className="space-y-4">
          <textarea className="input min-h-24" placeholder="Introduce yourself and your acquisition plans" value={msg} onChange={(e) => setMsg(e.target.value)} />
          <label className="flex items-start gap-3 text-sm text-slate-300">
            <input type="checkbox" checked={nda} onChange={(e) => setNda(e.target.checked)} className="mt-1 h-4 w-4 accent-blue-500" />
            {t("listing.ndaAgree")}
          </label>
          <Button className="w-full" disabled={!nda} loading={pending} onClick={() => start(async () => {
            const r = await requestDocumentAccessAction(listingId, msg, nda);
            if (!r.ok) return toast.error(r.error);
            setState("REQUESTED");
            setOpen(false);
          })}>{t("listing.requestAccess")}</Button>
        </div>
      </Modal>
    </div>
  );
}

// ───────────────────────────── Q&A ─────────────────────────────

export function Questions({ listingId, items, isSeller, userId }: { listingId: string; items: { id: string; question: string; answer: string | null; createdAt: string }[]; isSeller: boolean; userId: string | null }) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      {items.length === 0 && <p className="text-sm text-slate-500">{t("listing.noQuestions")}</p>}
      {items.map((it) => (
        <div key={it.id} className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/5">
          <div className="text-sm font-medium text-white">Q: {it.question}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">{timeAgo(it.createdAt, locale)}</div>
          {it.answer ? (
            <div className="mt-2 border-l-2 border-electric/50 pl-3 text-sm text-slate-300">{it.answer}</div>
          ) : isSeller ? (
            <div className="mt-3 flex gap-2">
              <input className="input py-2" placeholder={t("listing.answer")} value={answers[it.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [it.id]: e.target.value })} />
              <Button size="sm" className="h-10" disabled={pending} onClick={() => start(async () => {
                const r = await answerQuestionAction(it.id, answers[it.id] ?? "");
                if (!r.ok) return toast.error(r.error);
                router.refresh();
              })}>{t("listing.answer")}</Button>
            </div>
          ) : null}
        </div>
      ))}
      {userId && !isSeller && (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => {
          const r = await askQuestionAction(listingId, q);
          if (!r.ok) return toast.error(r.error);
          setQ("");
          toast.success("Question sent to the seller");
          router.refresh();
        }); }}>
          <input className="input" placeholder={t("listing.askQuestion")} value={q} onChange={(e) => setQ(e.target.value)} maxLength={1000} />
          <Button type="submit" loading={pending}>{t("common.submit")}</Button>
        </form>
      )}
    </div>
  );
}

// ───────────────────────────── Starter demo preview ─────────────────────────────

export function DemoPreview({ url, verified }: { url: string; verified: boolean }) {
  const t = useT();
  const [show, setShow] = useState(false);
  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-white/10">
      <div className="flex items-center gap-2 border-b border-white/5 bg-ink-850 px-3 py-2">
        <span className="flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-400/70" /><span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" /></span>
        <span className="ml-2 min-w-0 flex-1 truncate rounded-md bg-ink-950 px-2 py-1 font-mono text-xs text-slate-400">{url}</span>
        {verified && <span className="text-xs text-emerald-300">✓ {t("listing.demoVerified")}</span>}
        <a href={url} target="_blank" rel="noopener noreferrer nofollow" className={buttonClass("secondary", "sm")}>{t("starter.openDemo")}</a>
      </div>
      {show ? (
        // Sandboxed: the demo can run scripts but cannot touch VENTUREX cookies, navigate the top window or open popups.
        <iframe src={url} title="Live demo" sandbox="allow-scripts allow-forms allow-same-origin" referrerPolicy="no-referrer" loading="lazy" className="h-[520px] w-full bg-white" />
      ) : (
        <button onClick={() => setShow(true)} className="group relative grid h-64 w-full place-items-center bg-[radial-gradient(circle_at_50%_40%,rgba(59,130,246,0.25),transparent_60%)]">
          <div className="grid-bg absolute inset-0" />
          <span className={buttonClass("primary", "md", "relative")}>{t("starter.preview")}</span>
          <span className="absolute bottom-3 text-xs text-slate-500">Some sites block embedding — use “{t("starter.openDemo")}” if the preview stays blank.</span>
        </button>
      )}
    </div>
  );
}
