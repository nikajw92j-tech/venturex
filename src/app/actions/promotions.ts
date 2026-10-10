"use server";

import { actionUser } from "@/lib/auth/session";
import { run } from "@/lib/action";
import { enforceRateLimit } from "@/lib/ratelimit";
import { purchasePromotion } from "@/lib/promotions";

export async function buyPromotionAction(listingId: string, packageCode: string) {
  return run(async () => {
    const user = await actionUser({ verified: true });
    await enforceRateLimit(`promo-buy:${user.id}`, 15, 3600);
    return { url: await purchasePromotion(user.id, user.email, listingId, packageCode) };
  });
}
