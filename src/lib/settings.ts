import "server-only";
import { db } from "./db";

export type SiteSettings = {
  /** USD cents. Deals at or above this amount must go through the escrow partner. */
  escrowThresholdUsd: number;
  /** USD cents. Deals at or above this need an admin to approve payout release. */
  adminReleaseThresholdUsd: number;
  /** Hours the buyer has to inspect assets before they may confirm. */
  inspectionHours: number;
  /** Hours the auction winner has to pay. */
  auctionPaymentHours: number;
  /** Minutes a fixed-price buyer has to complete checkout before the listing is released. */
  checkoutHoldMinutes: number;
  /** Anti-sniping: window and extension in minutes. */
  antiSnipeWindowMinutes: number;
  antiSnipeExtensionMinutes: number;
  /** Require admin approval of new listings. */
  requireListingApproval: boolean;
  /** Start an auction's clock as soon as its listing goes live. Off = an admin starts or schedules it. */
  autoStartAuctions: boolean;
  /** Banner shown on every page (empty = none). */
  announcement: string;
  maintenanceMode: boolean;
  supportEmail: string;
};

export const DEFAULT_SETTINGS: SiteSettings = {
  escrowThresholdUsd: 1_000_000, // $10,000
  adminReleaseThresholdUsd: 200_000, // $2,000
  inspectionHours: 72,
  auctionPaymentHours: 72,
  checkoutHoldMinutes: 60,
  antiSnipeWindowMinutes: 2,
  antiSnipeExtensionMinutes: 2,
  requireListingApproval: true,
  autoStartAuctions: false,
  announcement: "",
  maintenanceMode: false,
  supportEmail: "support@venturex.example",
};

export async function getSettings(): Promise<SiteSettings> {
  const rows = await db.siteSetting.findMany();
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) out[r.key] = r.value;
  return out as SiteSettings;
}

export async function updateSettings(patch: Partial<SiteSettings>) {
  await db.$transaction(
    Object.entries(patch).map(([key, value]) =>
      db.siteSetting.upsert({
        where: { key },
        create: { key, value: value as never },
        update: { value: value as never },
      }),
    ),
  );
}
