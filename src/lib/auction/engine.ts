// Pure proxy-bidding engine (no I/O). The DB layer locks the auction row,
// feeds the current state in, and persists whatever this returns.

export type AuctionState = {
  startingBid: number;
  minIncrement: number;
  reservePrice: number | null;
  currentBid: number | null;
  currentBidderId: string | null;
  /** Active automatic-bid ceilings, including the current leader's. */
  autoBids: { bidderId: string; maxAmount: number }[];
};

export type BidInput = { bidderId: string; amount: number; maxAmount?: number | null };

export type PlacedBid = { bidderId: string; amount: number; isAuto: boolean };

export type BidResult =
  | { ok: false; error: string; minRequired: number }
  | {
      ok: true;
      bids: PlacedBid[];
      currentBid: number;
      leaderId: string;
      /** New automatic-bid ceiling for the bidder (null = unchanged). */
      autoBidMax: number | null;
      /** The user who lost the lead because of this action (if any). */
      outbidUserId: string | null;
      /** True when the bidder's own bid was immediately beaten by an existing automatic bid. */
      bidderOutbid: boolean;
    };

export function minimumNextBid(s: Pick<AuctionState, "startingBid" | "minIncrement" | "currentBid">) {
  return s.currentBid === null ? s.startingBid : s.currentBid + s.minIncrement;
}

function applyReserve(price: number, leaderMax: number, reserve: number | null) {
  // If the leader is willing to pay the reserve, jump the price to it so the reserve is met.
  if (reserve !== null && price < reserve && leaderMax >= reserve) return reserve;
  return price;
}

export function resolveBid(state: AuctionState, input: BidInput): BidResult {
  const minRequired = minimumNextBid(state);
  const amount = Math.trunc(input.amount);
  const requestedMax = input.maxAmount ? Math.trunc(input.maxAmount) : null;
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Invalid bid amount", minRequired };
  if (requestedMax !== null && requestedMax < amount) {
    return { ok: false, error: "Maximum automatic bid must be at least your bid", minRequired };
  }

  const auto = new Map(state.autoBids.map((a) => [a.bidderId, a.maxAmount]));

  // ── The current leader raising their own position ──
  if (state.currentBidderId === input.bidderId && state.currentBid !== null) {
    const existingMax = Math.max(auto.get(input.bidderId) ?? 0, state.currentBid);
    const newMax = Math.max(existingMax, requestedMax ?? 0, amount);
    if (newMax <= existingMax) {
      return { ok: false, error: "You are already the highest bidder", minRequired };
    }
    // Explicit raise of the visible bid (allowed so a leader can meet the reserve).
    let price = state.currentBid;
    const bids: PlacedBid[] = [];
    if (amount >= minRequired) {
      price = amount;
    }
    price = applyReserve(price, newMax, state.reservePrice);
    if (price !== state.currentBid) bids.push({ bidderId: input.bidderId, amount: price, isAuto: price !== amount });
    return {
      ok: true,
      bids,
      currentBid: price,
      leaderId: input.bidderId,
      autoBidMax: newMax > price ? newMax : null,
      outbidUserId: null,
      bidderOutbid: false,
    };
  }

  if (amount < minRequired) {
    return { ok: false, error: "Bid is below the minimum required amount", minRequired };
  }

  const userMax = Math.max(amount, requestedMax ?? 0);
  const leaderId = state.currentBidderId;

  // ── No existing leader ──
  if (!leaderId || state.currentBid === null) {
    const price = applyReserve(amount, userMax, state.reservePrice);
    return {
      ok: true,
      bids: [{ bidderId: input.bidderId, amount: price, isAuto: false }],
      currentBid: price,
      leaderId: input.bidderId,
      autoBidMax: userMax > price ? userMax : null,
      outbidUserId: null,
      bidderOutbid: false,
    };
  }

  const leaderMax = Math.max(state.currentBid, auto.get(leaderId) ?? 0);

  // ── Challenger beats the leader's ceiling ──
  if (userMax > leaderMax) {
    const bids: PlacedBid[] = [];
    if (leaderMax > state.currentBid) bids.push({ bidderId: leaderId, amount: leaderMax, isAuto: true });
    let price = Math.max(amount, Math.min(userMax, leaderMax + state.minIncrement));
    price = applyReserve(price, userMax, state.reservePrice);
    bids.push({ bidderId: input.bidderId, amount: price, isAuto: price !== amount });
    return {
      ok: true,
      bids,
      currentBid: price,
      leaderId: input.bidderId,
      autoBidMax: userMax > price ? userMax : null,
      outbidUserId: leaderId,
      bidderOutbid: false,
    };
  }

  // ── Leader's automatic bid defends (ties go to the earlier bidder) ──
  const bids: PlacedBid[] = [{ bidderId: input.bidderId, amount: userMax, isAuto: userMax !== amount }];
  let defend = Math.min(leaderMax, userMax + state.minIncrement);
  defend = Math.max(defend, userMax); // equal ceilings: leader keeps the lead at that amount
  defend = applyReserve(defend, leaderMax, state.reservePrice);
  bids.push({ bidderId: leaderId, amount: defend, isAuto: true });
  return {
    ok: true,
    bids,
    currentBid: defend,
    leaderId,
    autoBidMax: null,
    outbidUserId: null,
    bidderOutbid: true,
  };
}

/** Anti-sniping: a valid bid in the final window pushes the end time back. */
export function antiSnipe(endsAt: Date, now: Date, windowMinutes: number, extensionMinutes: number) {
  const remaining = endsAt.getTime() - now.getTime();
  if (remaining > 0 && remaining <= windowMinutes * 60_000) {
    return { endsAt: new Date(endsAt.getTime() + extensionMinutes * 60_000), extended: true };
  }
  return { endsAt, extended: false };
}

export const AUCTION_DURATIONS_HOURS = [24, 72, 168, 336, 720] as const;

/** Masks a username for public bid history: "alexander" → "a•••r". */
export function maskName(name: string) {
  if (name.length <= 2) return `${name[0] ?? "?"}•••`;
  return `${name[0]}•••${name[name.length - 1]}`;
}
