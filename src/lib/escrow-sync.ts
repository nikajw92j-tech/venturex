import "server-only";
import { db } from "./db";
import { completeDeal, markDealPaid } from "./deals";
import { fetchEscrowState } from "./payments/escrow";
import { audit } from "./audit";
import { kickEmails } from "./notify";

/** Pulls the authoritative escrow status from the API and advances the deal. */
export async function syncEscrowDeal(dealId: string) {
  const deal = await db.deal.findUnique({ where: { id: dealId } });
  if (!deal?.escrowReference) return;
  const state = await fetchEscrowState(deal.escrowReference);
  if (state === deal.escrowStatus) return;
  await db.deal.update({ where: { id: dealId }, data: { escrowStatus: state } });
  await audit({ action: "deal.escrow_status", entityType: "Deal", entityId: dealId, data: { state } });
  if (state === "funded" && deal.status === "PENDING_PAYMENT") {
    await db.$transaction((tx) => markDealPaid(tx, dealId, "escrow.com"));
  } else if (state === "released" && deal.status !== "COMPLETED" && deal.buyerConfirmedAt && deal.sellerConfirmedAt) {
    await completeDeal(dealId, { escrow: true });
  }
  kickEmails();
}

export async function syncAllEscrow() {
  const deals = await db.deal.findMany({ where: { escrowReference: { not: null }, status: { notIn: ["COMPLETED", "CANCELLED", "REFUNDED"] } }, select: { id: true } });
  for (const d of deals) await syncEscrowDeal(d.id).catch((e) => console.error("[escrow sync]", d.id, e));
  return deals.length;
}
