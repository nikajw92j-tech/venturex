import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getI18n } from "@/i18n/server";
import { Avatar } from "@/components/layout/navbar";
import { ConversationLink } from "@/components/messages/conversation-link";
import { timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Messages", robots: { index: false } };

export default async function MessagesLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/messages");
  const { t, locale } = await getI18n();
  const parts = await db.conversationParticipant.findMany({
    where: { userId: user.id },
    include: {
      conversation: {
        include: {
          listing: { select: { title: true } },
          participants: { where: { userId: { not: user.id } }, include: { user: { select: { displayName: true, avatarUrl: true } } } },
          messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, createdAt: true, senderId: true } },
        },
      },
    },
    orderBy: { conversation: { lastMessageAt: "desc" } },
    take: 100,
  });

  return (
    <div className="container-x py-8">
      <h1 className="mb-6 font-display text-3xl font-semibold text-white">{t("msg.title")}</h1>
      <div className="glass card-shadow grid min-h-[70vh] overflow-hidden rounded-2xl md:grid-cols-[320px_1fr]">
        <aside className="border-b border-white/5 md:border-r md:border-b-0">
          <div className="max-h-[70vh] overflow-y-auto">
            {parts.length === 0 && <p className="p-6 text-sm text-slate-500">{t("msg.empty")}</p>}
            {parts.map((p) => {
              const other = p.conversation.participants[0]?.user;
              const last = p.conversation.messages[0];
              const unread = last && last.senderId !== user.id && (!p.lastReadAt || last.createdAt > p.lastReadAt);
              return (
                <ConversationLink key={p.conversationId} href={`/messages/${p.conversationId}`}>
                  <Avatar name={other?.displayName ?? "?"} src={other?.avatarUrl} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-white">{other?.displayName ?? "—"}</span>
                      {last && <span className="shrink-0 text-[11px] text-slate-500">{timeAgo(last.createdAt, locale)}</span>}
                    </div>
                    {p.conversation.listing && <div className="truncate text-[11px] text-electric-400">{p.conversation.listing.title}</div>}
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs text-slate-400">{last?.body ?? ""}</span>
                      {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-electric-400" />}
                    </div>
                  </div>
                </ConversationLink>
              );
            })}
          </div>
        </aside>
        <section className="min-w-0">{children}</section>
      </div>
      <p className="mt-3 text-xs text-slate-500">{t("msg.safety")} <Link href="/help" className="underline">{t("footer.help")}</Link></p>
    </div>
  );
}
