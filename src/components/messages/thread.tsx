"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Ban, Flag, HandCoins, Paperclip, Send, X } from "lucide-react";
import { Avatar } from "../layout/navbar";
import { Button } from "../ui";
import { Modal } from "../modal";
import { useToast } from "../toast";
import { useRealtime } from "../realtime";
import { uploadFile } from "../uploader";
import { blockConversationAction, loadMessagesAction, reportConversationAction, sendMessageAction } from "@/app/actions/messages";
import { OfferResponse } from "../dashboard/listing-actions";
import { useLocale, useT } from "@/i18n/client";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import { cn, timeAgo } from "@/lib/utils";

type Msg = Awaited<ReturnType<typeof loadMessagesAction>>[number];

export function ChatThread({ conversationId, me, verified, other, listing, initial, blocked }: { conversationId: string; me: string; verified: boolean; other: { name: string; username: string; avatarUrl: string | null } | null; listing: { title: string; slug: string } | null; initial: Msg[]; blocked: boolean }) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const router = useRouter();
  const [messages, setMessages] = useState(initial);
  const [text, setText] = useState("");
  const [file, setFile] = useState<{ id: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [report, setReport] = useState(false);
  const [reason, setReason] = useState("Spam or scam");
  const [pending, start] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => setMessages(initial), [initial]);
  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), [messages.length]);

  const refresh = async () => setMessages(await loadMessagesAction(conversationId));
  useRealtime([`conversation:${conversationId}`], () => refresh(), () => refresh());

  function send() {
    if (!text.trim() && !file) return;
    const body = text;
    start(async () => {
      const r = await sendMessageAction(conversationId, body, file?.id ?? null);
      if (!r.ok) return toast.error(r.error);
      setText("");
      setFile(null);
      if (r.data?.flagged) toast.info("This message was flagged for review. Never pay or share credentials outside VENTUREX.");
      await refresh();
    });
  }

  return (
    <div className="flex h-[70vh] flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-white/5 px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {other && <Avatar name={other.name} src={other.avatarUrl} size={36} />}
          <div className="min-w-0">
            {other && <Link href={`/u/${other.username}`} className="truncate font-semibold text-white hover:underline">{other.name}</Link>}
            {listing && <Link href={`/listing/${listing.slug}`} className="block truncate text-xs text-electric-400 hover:underline">{listing.title}</Link>}
          </div>
        </div>
        <div className="flex gap-1">
          <button onClick={() => setReport(true)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white" title={t("msg.report")}><Flag className="h-4 w-4" /></button>
          {!blocked && <button onClick={() => confirm("Close this conversation? Neither side will be able to send new messages.") && start(async () => { await blockConversationAction(conversationId); router.refresh(); })} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white" title="Block"><Ban className="h-4 w-4" /></button>}
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        <AnimatePresence initial={false}>
          {messages.map((m) => {
            const mine = m.senderId === me;
            if (m.kind === "SYSTEM") return <motion.div key={m.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-xs text-slate-500">{m.body}</motion.div>;
            return (
              <motion.div key={m.id} initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[80%] rounded-2xl px-4 py-2.5 text-sm", mine ? "rounded-br-md bg-brand text-white" : "rounded-bl-md bg-white/[0.06] text-slate-100 ring-1 ring-white/5")}>
                  {m.kind === "OFFER" && m.offer && (
                    <div className="mb-2 rounded-xl bg-black/20 p-3">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-wider opacity-80"><HandCoins className="h-3.5 w-3.5" /> {m.offer.fromSeller ? "Counter-offer" : "Offer"} · {m.offer.status.toLowerCase()}</div>
                      <div className="mt-1 font-display text-xl font-semibold">{formatMoney(m.offer.amount, m.offer.currency as CurrencyCode, { locale })}</div>
                      {m.offer.status === "PENDING" && (
                        <div className="mt-2">
                          <OfferResponse id={m.offer.id} currency={m.offer.currency} canRespond={(m.offer.fromSeller ? m.offer.buyerId : m.offer.sellerId) === me} canWithdraw={(m.offer.fromSeller ? m.offer.sellerId : m.offer.buyerId) === me} />
                        </div>
                      )}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                  {m.attachment && (
                    <a href={`/api/files/${m.attachment.id}`} target="_blank" className={cn("mt-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs", mine ? "bg-white/15" : "bg-white/5")}><Paperclip className="h-3.5 w-3.5" /> {m.attachment.filename}</a>
                  )}
                  {m.flagged && !mine && <div className="mt-2 flex items-center gap-1 text-[11px] text-amber-300"><AlertTriangle className="h-3 w-3" /> Possible off-platform payment request. Keep payments on VENTUREX.</div>}
                  <div className={cn("mt-1 text-[10px]", mine ? "text-white/60" : "text-slate-500")}>{timeAgo(m.createdAt, locale)}</div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={bottom} />
      </div>

      {blocked ? (
        <div className="border-t border-white/5 p-4 text-center text-sm text-slate-500">This conversation has been closed.</div>
      ) : (
        <form className="border-t border-white/5 p-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
          {file && <div className="mb-2 flex items-center gap-2 text-xs text-slate-300"><Paperclip className="h-3.5 w-3.5" /> {file.name} <button type="button" onClick={() => setFile(null)}><X className="h-3.5 w-3.5" /></button></div>}
          <div className="flex items-end gap-2">
            <button type="button" disabled={uploading || !verified} onClick={() => fileInput.current?.click()} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-400 hover:bg-white/5 hover:text-white" aria-label={t("msg.attach")}>
              {uploading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Paperclip className="h-5 w-5" />}
            </button>
            <input ref={fileInput} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx,.docx" onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setUploading(true);
              try {
                const up = await uploadFile(f, "message");
                setFile({ id: up.id, name: up.name });
              } catch (err) {
                toast.error((err as Error).message);
              } finally {
                setUploading(false);
              }
            }} />
            <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} rows={1} placeholder={verified ? t("msg.placeholder") : t("auth.verifyBanner")} disabled={!verified} className="input max-h-40 min-h-10 resize-none" maxLength={5000} />
            <Button type="submit" loading={pending} disabled={!verified} className="h-10 w-10 shrink-0 p-0" aria-label={t("msg.send")}><Send className="h-4 w-4" /></Button>
          </div>
        </form>
      )}

      <Modal open={report} onClose={() => setReport(false)} title={t("msg.report")}>
        <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
          {["Spam or scam", "Request to pay outside VENTUREX", "Harassment", "Other"].map((r) => <option key={r}>{r}</option>)}
        </select>
        <Button className="mt-4 w-full" loading={pending} onClick={() => start(async () => { const r = await reportConversationAction(conversationId, reason); if (!r.ok) return toast.error(r.error); toast.success("Reported to trust & safety"); setReport(false); })}>{t("common.submit")}</Button>
      </Modal>
    </div>
  );
}
