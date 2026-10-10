import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgeCheck, Calendar, GitBranch, Globe, MapPin, Star } from "lucide-react";
import { db } from "@/lib/db";
import { getI18n } from "@/i18n/server";
import { getCurrentUser } from "@/lib/auth/session";
import { trustScore } from "@/lib/trust";
import { cardInclude, toCard } from "@/lib/listings";
import { userPlan } from "@/lib/listing-service";
import { countryName } from "@/lib/categories";
import { Avatar } from "@/components/layout/navbar";
import { Card, EmptyState } from "@/components/ui";
import { ListingGrid } from "@/components/listing-card";
import { ContactUserButton } from "@/components/profile/contact";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const u = await db.user.findUnique({ where: { username }, select: { displayName: true, storefrontTitle: true, bio: true, status: true } });
  if (!u || u.status !== "ACTIVE") return { title: "Profile" };
  return { title: u.storefrontTitle ?? `${u.displayName} — seller profile`, description: u.bio?.slice(0, 160) };
}

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const { t, locale } = await getI18n();
  const u = await db.user.findUnique({ where: { username } });
  if (!u || u.status !== "ACTIVE") notFound();
  const [viewer, trust, plan, listings, sold, reviews] = await Promise.all([
    getCurrentUser(),
    trustScore(u.id),
    userPlan(u.id),
    db.listing.findMany({ where: { sellerId: u.id, status: "ACTIVE" }, include: cardInclude, orderBy: { publishedAt: "desc" } }),
    db.listing.findMany({ where: { sellerId: u.id, status: "SOLD" }, include: cardInclude, orderBy: { updatedAt: "desc" }, take: 8 }),
    db.sellerReview.findMany({ where: { sellerId: u.id }, include: { author: { select: { displayName: true } }, deal: { select: { listing: { select: { title: true } } } } }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const accent = plan.code === "BUSINESS" && u.storefrontAccent ? u.storefrontAccent : null;

  return (
    <div>
      <section className="relative overflow-hidden border-b border-white/5">
        <div className="absolute inset-0" style={{ background: accent ? `radial-gradient(circle at 20% 0%, ${accent}55, transparent 60%)` : "radial-gradient(circle at 20% 0%, rgba(59,130,246,0.3), transparent 60%), radial-gradient(circle at 80% 100%, rgba(139,92,246,0.25), transparent 60%)" }} />
        <div className="grid-bg absolute inset-0" />
        <div className="container-x relative flex flex-col gap-6 py-12 md:flex-row md:items-end md:justify-between">
          <div className="flex items-end gap-5">
            <Avatar name={u.displayName} src={u.avatarUrl} size={96} />
            <div>
              {plan.storefront && u.storefrontTitle && <div className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: accent ?? "#60a5fa" }}>{u.storefrontTitle}</div>}
              <h1 className="mt-1 flex items-center gap-2 font-display text-3xl font-semibold text-white">{u.displayName} {(u.identityVerified || u.businessVerified) && <BadgeCheck className="h-6 w-6 text-electric-400" />}</h1>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-400">
                <span>@{u.username}</span>
                {u.country && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {countryName(u.country)}</span>}
                <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {t("listing.memberSince", { date: u.createdAt.toLocaleDateString(locale, { month: "short", year: "numeric" }) })}</span>
                {u.githubUrl && <a href={u.githubUrl} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1 hover:text-white"><GitBranch className="h-3.5 w-3.5" /> GitHub</a>}
                {u.websiteUrl && <a href={u.websiteUrl} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1 hover:text-white"><Globe className="h-3.5 w-3.5" /> Website</a>}
              </div>
            </div>
          </div>
          {viewer && viewer.id !== u.id && <ContactUserButton username={u.username} />}
        </div>
      </section>

      <div className="container-x grid gap-8 py-10 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-4">
          {trust && (
            <Card className="p-5">
              <div className="flex items-center justify-between"><span className="text-sm text-slate-400">{t("listing.trustScore")}</span><span className="font-display text-2xl font-semibold text-white">{trust.score}</span></div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-brand" style={{ width: `${trust.score}%` }} /></div>
              <ul className="mt-4 space-y-1 text-xs text-slate-400">{trust.factors.map((f) => <li key={f.label} className="flex justify-between gap-2"><span>{f.label}</span><span className={f.points < 0 ? "text-red-300" : ""}>{f.points}{f.max ? `/${f.max}` : ""}</span></li>)}</ul>
              <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs">
                <div className="rounded-lg bg-white/[0.03] py-2"><div className="font-semibold text-white">{trust.completedSales}</div><div className="text-slate-500">{t("dash.completedSales")}</div></div>
                <div className="rounded-lg bg-white/[0.03] py-2"><div className="flex items-center justify-center gap-1 font-semibold text-white">{trust.rating ?? "—"} {trust.rating && <Star className="h-3 w-3 fill-amber-300 text-amber-300" />}</div><div className="text-slate-500">{trust.reviewCount} reviews</div></div>
              </div>
            </Card>
          )}
          {u.bio && <Card className="p-5 text-sm whitespace-pre-line text-slate-300">{u.bio}</Card>}
          {u.skills.length > 0 && (
            <Card className="p-5">
              <div className="mb-2 text-xs uppercase tracking-wider text-slate-500">Skills</div>
              <div className="flex flex-wrap gap-1.5">{u.skills.map((s) => <span key={s} className="rounded-md bg-white/5 px-2 py-0.5 text-xs text-slate-200 ring-1 ring-white/10">{s}</span>)}</div>
            </Card>
          )}
        </aside>
        <div className="min-w-0 space-y-10">
          <section>
            <h2 className="mb-4 font-display text-xl font-semibold text-white">Live listings</h2>
            {listings.length ? <ListingGrid items={listings.map(toCard)} className="xl:grid-cols-3" /> : <EmptyState title={t("common.noResults")} />}
          </section>
          {sold.length > 0 && (
            <section>
              <h2 className="mb-4 font-display text-xl font-semibold text-white">Sold on VENTUREX</h2>
              <div className="opacity-75"><ListingGrid items={sold.map(toCard)} className="xl:grid-cols-3" /></div>
            </section>
          )}
          <section>
            <h2 className="mb-4 font-display text-xl font-semibold text-white">Reviews from verified buyers</h2>
            {reviews.length === 0 ? <p className="text-sm text-slate-500">{t("listing.noRating")}</p> : (
              <div className="space-y-3">
                {reviews.map((r) => (
                  <Card key={r.id} className="p-4">
                    <div className="flex items-center gap-1">{Array.from({ length: 5 }).map((_, i) => <Star key={i} className={i < r.rating ? "h-4 w-4 fill-amber-300 text-amber-300" : "h-4 w-4 text-slate-600"} />)}</div>
                    {r.comment && <p className="mt-2 text-sm text-slate-300">{r.comment}</p>}
                    <div className="mt-2 text-xs text-slate-500">{r.author.displayName} · bought {r.deal.listing.title} · {r.createdAt.toLocaleDateString(locale)}</div>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
