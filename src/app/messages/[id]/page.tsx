import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { loadMessagesAction } from "@/app/actions/messages";
import { ChatThread } from "@/components/messages/thread";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/messages/${id}`);
  const convo = await db.conversation.findFirst({
    where: { id, participants: { some: { userId: user.id } } },
    include: { listing: { select: { title: true, slug: true } }, participants: { include: { user: { select: { id: true, displayName: true, username: true, avatarUrl: true } } } } },
  });
  if (!convo) notFound();
  const messages = await loadMessagesAction(id);
  const other = convo.participants.find((p) => p.userId !== user.id)?.user;
  const blocked = convo.participants.some((p) => p.blocked);
  return (
    <ChatThread
      conversationId={id}
      me={user.id}
      verified={Boolean(user.emailVerifiedAt)}
      other={other ? { name: other.displayName, username: other.username, avatarUrl: other.avatarUrl } : null}
      listing={convo.listing}
      initial={messages}
      blocked={blocked}
    />
  );
}
