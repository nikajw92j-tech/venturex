import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { categoryLabel } from "@/lib/categories";
import { formatMoney, type CurrencyCode } from "@/lib/money";

export const runtime = "nodejs";
export const alt = "Business for sale on VENTUREX";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function ListingOg({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const l = await db.listing.findUnique({ where: { slug }, include: { auction: true } });
  const visible = l && ["ACTIVE", "PENDING_SALE", "SOLD", "EXPIRED"].includes(l.status);
  const c = (l?.currency ?? "USD") as CurrencyCode;
  const price = l ? (l.saleType === "AUCTION" && l.auction ? (l.auction.currentBid ?? l.auction.startingBid) : (l.askingPrice ?? 0)) : 0;
  // Latin-only default font: non-Latin titles fall back to the category label.
  const latin = (s: string) => (/^[\x20-\x7E]+$/.test(s) ? s : null);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 70, backgroundColor: "#03050b", backgroundImage: "radial-gradient(circle at 85% 15%, #4c1d95 0%, #03050b 50%)", color: "white" }}>
        <div style={{ display: "flex", fontSize: 28, fontWeight: 800, letterSpacing: 8 }}>VENTURE<span style={{ color: "#a78bfa" }}>X</span></div>
        {visible ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 28, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 3 }}>{`${categoryLabel(l.category)}${l.saleType === "AUCTION" ? " · Live auction" : ""}`}</div>
            <div style={{ marginTop: 16, fontSize: 72, fontWeight: 700, lineHeight: 1.05 }}>{latin(l.title) ?? "Digital business for sale"}</div>
            <div style={{ display: "flex", gap: 40, marginTop: 40, fontSize: 32 }}>
              <div style={{ display: "flex", flexDirection: "column" }}><span style={{ color: "#94a3b8", fontSize: 22 }}>{l.saleType === "AUCTION" ? "Current bid" : "Asking price"}</span>{formatMoney(price, c)}</div>
              {l.monthlyRevenue > 0 && <div style={{ display: "flex", flexDirection: "column" }}><span style={{ color: "#94a3b8", fontSize: 22 }}>Monthly revenue</span>{formatMoney(l.monthlyRevenue, c)}</div>}
              {l.monthlyProfit > 0 && <div style={{ display: "flex", flexDirection: "column" }}><span style={{ color: "#94a3b8", fontSize: 22 }}>Monthly profit</span>{formatMoney(l.monthlyProfit, c)}</div>}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 64, fontWeight: 700 }}>Digital businesses for sale</div>
        )}
        <div style={{ fontSize: 22, color: "#64748b" }}>Figures are seller-reported unless marked verified.</div>
      </div>
    ),
    size,
  );
}
