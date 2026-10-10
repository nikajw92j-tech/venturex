"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";

export async function recentNotificationsAction() {
  const user = await getCurrentUser();
  if (!user) return { items: [], unread: 0 };
  const [items, unread] = await Promise.all([
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 12 }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  // Opening the bell marks the visible items as read.
  await db.notification.updateMany({ where: { id: { in: items.filter((i) => !i.readAt).map((i) => i.id) } }, data: { readAt: new Date() } });
  return {
    items: items.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() })),
    unread: Math.max(0, unread - items.filter((i) => !i.readAt).length),
  };
}

export async function markAllReadAction() {
  const user = await getCurrentUser();
  if (!user) return;
  await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/notifications");
}
