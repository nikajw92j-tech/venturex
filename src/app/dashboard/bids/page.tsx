import Link from "next/link";
import { Crown } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getI18n } from "@/i18n/server";
import { Badge, Card, EmptyState, LinkButton } from "@/components/ui";
import { InlineCountdown } from "@/components/countdown";
import { formatMoney, type CurrencyCode } from "@/lib/money";

export default async function BidsPage() {
  const user = await requireUser("/dashboard/bids");
  const { t, locale } = await getI18n();
  const auctions = await db.auction.findMany({
    where: { bids: { some: { bidderId: user.id } } },
    include: { listing: { select: { title: true, slug: true, currency: true } }, bids: { where: { bidderId: user.id }, orderBy: { amount: "desc" }, take: 1 }, autoBids: { where: { bidderId: user.id, active: true } } },
    orderBy: { endsAt: "desc" },
  });
  const deals = await db.deal.findMany({ where: { buyerId: user.id, source: { in: ["AUCTION", "BUY_NOW"] } }, select: { id: true, listingId: true } });

  return (
    <div>
      <h1 className="mb-6 font-display text-3xl font-semibold text-white">{t("dash.bids")}</h1>
      {auctions.length === 0 ? (
        <EmptyState title={t("auction.noBids")} action={<LinkButton href="/auctions">{t("nav.auctions")}</LinkButton>} />
      ) : (
        <div className="space-y-3">
          {auctions.map((a) => {
            const c = a.listing.currency as CurrencyCode;
            const live = a.status === "LIVE";
            const leading = a.currentBidderId === user.id;
            const won = a.winnerId === user.id;
            const deal = deals.find((d) => d.listingId === a.listingId);
            return (
              <Card key={a.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <Link href={`/listing/${a.listing.slug}`} className="font-medium text-white hover:underline">{a.listing.title}</Link>
                  <div className="mt-0.5 text-sm text-slate-400">
                    Your highest bid {formatMoney(a.bids[0]?.amount ?? 0, c, { locale })} · current {formatMoney(a.currentBid ?? a.startingBid, c, { locale })}
                    {a.autoBids[0] && live && <span className="text-violet-300"> · auto-bid up to {formatMoney(a.autoBids[0].maxAmount, c, { locale })}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {live && <span className="text-sm"><InlineCountdown endsAt={a.endsAt?.toISOString() ?? null} /></span>}
                  {won ? <Badge tone="gold"><Crown className="h-3 w-3" /> {t("auction.won")}</Badge> : live ? <Badge tone={leading ? "green" : "red"}>{leading ? t("auction.leading") : t("auction.outbid")}</Badge> : <Badge>{t("common.ended")}</Badge>}
                  {deal && <LinkButton href={`/dashboard/deals/${deal.id}`} size="sm">{t("dash.transferProgress")}</LinkButton>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
