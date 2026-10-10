import { describe, expect, it } from "vitest";
import { antiSnipe, minimumNextBid, resolveBid, type AuctionState } from "@/lib/auction/engine";

const base: AuctionState = { startingBid: 1000, minIncrement: 100, reservePrice: null, currentBid: null, currentBidderId: null, autoBids: [] };

describe("proxy bidding engine", () => {
  it("first bid must be at least the starting bid", () => {
    expect(resolveBid(base, { bidderId: "a", amount: 900 }).ok).toBe(false);
    const r = resolveBid(base, { bidderId: "a", amount: 1000 });
    expect(r.ok && r.currentBid).toBe(1000);
  });

  it("enforces the minimum increment", () => {
    const s = { ...base, currentBid: 1000, currentBidderId: "a" };
    expect(minimumNextBid(s)).toBe(1100);
    expect(resolveBid(s, { bidderId: "b", amount: 1050 }).ok).toBe(false);
    const r = resolveBid(s, { bidderId: "b", amount: 1100 });
    expect(r.ok && r.leaderId).toBe("b");
    expect(r.ok && r.outbidUserId).toBe("a");
  });

  it("an automatic bid defends the leader up to its maximum", () => {
    const s = { ...base, currentBid: 1000, currentBidderId: "a", autoBids: [{ bidderId: "a", maxAmount: 2000 }] };
    const r = resolveBid(s, { bidderId: "b", amount: 1500 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.leaderId).toBe("a");
    expect(r.currentBid).toBe(1600); // challenger's 1500 + increment
    expect(r.bidderOutbid).toBe(true);
  });

  it("a challenger beating the leader's maximum wins at max + increment", () => {
    const s = { ...base, currentBid: 1000, currentBidderId: "a", autoBids: [{ bidderId: "a", maxAmount: 2000 }] };
    const r = resolveBid(s, { bidderId: "b", amount: 1100, maxAmount: 5000 });
    expect(r.ok && r.leaderId).toBe("b");
    expect(r.ok && r.currentBid).toBe(2100);
    expect(r.ok && r.autoBidMax).toBe(5000);
    expect(r.ok && r.outbidUserId).toBe("a");
  });

  it("equal maximums: the earlier bidder keeps the lead", () => {
    const s = { ...base, currentBid: 1000, currentBidderId: "a", autoBids: [{ bidderId: "a", maxAmount: 3000 }] };
    const r = resolveBid(s, { bidderId: "b", amount: 3000 });
    expect(r.ok && r.leaderId).toBe("a");
    expect(r.ok && r.currentBid).toBe(3000);
  });

  it("jumps to the reserve when the leader's maximum covers it", () => {
    const s = { ...base, reservePrice: 5000 };
    const r = resolveBid(s, { bidderId: "a", amount: 1000, maxAmount: 8000 });
    expect(r.ok && r.currentBid).toBe(5000);
  });

  it("the leader cannot outbid themselves but can raise their maximum", () => {
    const s = { ...base, currentBid: 1000, currentBidderId: "a" };
    expect(resolveBid(s, { bidderId: "a", amount: 1000 }).ok).toBe(false);
    const r = resolveBid(s, { bidderId: "a", amount: 1000, maxAmount: 4000 });
    expect(r.ok && r.autoBidMax).toBe(4000);
    expect(r.ok && r.currentBid).toBe(1000);
  });

  it("rejects a maximum lower than the bid", () => {
    expect(resolveBid(base, { bidderId: "a", amount: 2000, maxAmount: 1500 }).ok).toBe(false);
  });
});

describe("anti-sniping", () => {
  const ends = new Date("2026-01-01T12:00:00Z");
  it("extends by 2 minutes when a bid lands in the final 2 minutes", () => {
    const r = antiSnipe(ends, new Date("2026-01-01T11:59:00Z"), 2, 2);
    expect(r.extended).toBe(true);
    expect(r.endsAt.toISOString()).toBe("2026-01-01T12:02:00.000Z");
  });
  it("does not extend earlier bids", () => {
    const r = antiSnipe(ends, new Date("2026-01-01T11:50:00Z"), 2, 2);
    expect(r.extended).toBe(false);
    expect(r.endsAt).toBe(ends);
  });
});
