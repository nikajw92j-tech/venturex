import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getI18n } from "@/i18n/server";
import { cardInclude, toCard } from "@/lib/listings";
import { ListingGrid } from "@/components/listing-card";
import { EmptyState, LinkButton } from "@/components/ui";

export const metadata: Metadata = { title: "Watchlist", robots: { index: false } };

export default async function WatchlistPage() {
  const user = await requireUser("/watchlist");
  const { t } = await getI18n();
  const items = await db.watchlistItem.findMany({ where: { userId: user.id }, include: { listing: { include: cardInclude } }, orderBy: { createdAt: "desc" } });
  const live = items.filter((i) => ["ACTIVE", "PENDING_SALE"].includes(i.listing.status));
  const past = items.filter((i) => !["ACTIVE", "PENDING_SALE"].includes(i.listing.status));
  return (
    <div className="container-x py-10">
      <h1 className="font-display text-3xl font-semibold text-white">{t("watch.title")}</h1>
      <p className="mt-2 mb-8 text-slate-400">{t("watch.subtitle")}</p>
      {items.length === 0 ? (
        <EmptyState title={t("watch.empty")} action={<LinkButton href="/marketplace">{t("nav.marketplace")}</LinkButton>} />
      ) : (
        <>
          <ListingGrid items={live.map((i) => toCard(i.listing))} />
          {past.length > 0 && (
            <>
              <h2 className="mt-14 mb-4 font-display text-xl font-semibold text-slate-300">{t("common.ended")}</h2>
              <div className="opacity-60"><ListingGrid items={past.map((i) => toCard(i.listing))} /></div>
            </>
          )}
        </>
      )}
    </div>
  );
}
