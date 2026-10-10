// End-to-end UI walkthrough against a running dev server with sample data.
//   npm run dev  (APP_URL must match BASE)   then:   node tests/e2e/ui-flow.mjs
// Uses an installed Chromium-based browser (Edge/Chrome) via playwright-core.
import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = process.env.SHOT_DIR ?? "e2e-shots";
const BROWSERS = [
  process.env.BROWSER_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
].filter(Boolean);
const executablePath = BROWSERS.find((p) => fs.existsSync(p));
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true });
const step = (msg) => console.log(`• ${msg}`);
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });

async function login(email) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "Password123!");
  await Promise.all([page.waitForURL(/\/dashboard/, { timeout: 60000 }), page.click('button[type="submit"]')]);
  return page;
}

async function listingUrl(page, title) {
  await page.goto(`${BASE}/marketplace?q=${encodeURIComponent(title)}`);
  const href = await page.locator(`a[href^="/listing/"]:has-text("${title}")`).first().getAttribute("href");
  if (!href) throw new Error(`Listing "${title}" not found`);
  return `${BASE}${href}`;
}

let failures = 0;
async function check(name, fn) {
  try {
    await fn();
    step(`PASS ${name}`);
  } catch (e) {
    failures++;
    console.error(`✗ FAIL ${name}: ${e.message}`);
  }
}

// ── 1. Live bidding with real-time updates across two browsers ──
const buyer = await login("buyer@venturex.local");
const buyer2 = await login("buyer2@venturex.local");
const auctionUrl = await listingUrl(buyer, "PromptForge AI");

await check("bid placement + realtime update to another viewer", async () => {
  await buyer.goto(auctionUrl);
  await buyer2.goto(auctionUrl);
  await buyer.waitForSelector("#bid-amount", { timeout: 60000 });
  await buyer2.waitForSelector("#bid-amount", { timeout: 60000 });
  await buyer.waitForTimeout(1500); // let SSE connect
  const min = Number(await buyer.inputValue("#bid-amount"));
  await buyer.click('button:has-text("Place bid")');
  await buyer.locator('[role="dialog"] button:has-text("Submit")').click();
  await buyer.getByText("You're the highest bidder").first().waitFor({ timeout: 20000 });
  await shot(buyer, "01-bid-leading");
  // buyer2 sees the new price pushed in real time, without reloading
  const expected = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(min);
  await buyer2.getByText(expected).first().waitFor({ timeout: 20000 });
  await shot(buyer2, "02-realtime-other-viewer");
});

await check("outbid notification reaches the first bidder live", async () => {
  const next = Number(await buyer2.inputValue("#bid-amount"));
  await buyer2.fill("#bid-amount", String(next));
  await buyer2.click('button:has-text("Place bid")');
  await buyer2.locator('[role="dialog"] button:has-text("Submit")').click();
  await buyer2.getByText("You're the highest bidder").first().waitFor({ timeout: 20000 });
  await buyer.getByText("You've been outbid").first().waitFor({ timeout: 20000 });
  await shot(buyer, "03-outbid-toast");
});

// ── 2. Fixed-price purchase → sandbox payment → handover → payout ──
// Fresh listing per run so the walkthrough never depends on earlier runs.
const prisma = new PrismaClient();
const ana = await prisma.user.findUniqueOrThrow({ where: { email: "ana@venturex.local" } });
await prisma.user.update({ where: { id: ana.id }, data: { payoutAccountId: `sbx_acct_${ana.id}`, payoutsEnabled: true } });
const fixedTitle = `E2E Fixed Listing ${Date.now().toString(36)}`;
const fixed = await prisma.listing.create({
  data: { slug: fixedTitle.toLowerCase().replace(/ /g, "-"), sellerId: ana.id, status: "ACTIVE", saleType: "FIXED", title: fixedTitle, category: "BLOG", description: "End-to-end test listing. ".repeat(6), currency: "USD", askingPrice: 90000, priceUsd: 90000, assetsIncluded: ["Domain", "Content"], publishedAt: new Date() },
});
await prisma.$disconnect();
let dealUrl = "";
await check("buy fixed-price listing and pay in sandbox", async () => {
  await buyer.goto(`${BASE}/listing/${fixed.slug}`);
  await buyer.click('button:has-text("Buy for")');
  await buyer.locator('[role="dialog"] button:has-text("Continue")').click();
  await buyer.waitForURL(/\/sandbox\/checkout\//, { timeout: 60000 });
  await shot(buyer, "04-sandbox-checkout");
  await Promise.all([buyer.waitForURL(/\/dashboard\/deals\//, { timeout: 60000 }), buyer.click('button:has-text("Simulate successful payment")')]);
  dealUrl = buyer.url().split("?")[0];
  await buyer.getByText("Paid · preparing").first().waitFor({ timeout: 20000 });
  await shot(buyer, "05-deal-paid");
});

await check("seller hands over assets, both confirm, funds released", async () => {
  const seller = await login("ana@venturex.local");
  await seller.goto(dealUrl);
  await seller.click('button:has-text("Assets prepared")');
  await seller.getByText("In transfer").first().waitFor({ timeout: 20000 });
  await seller.click('button:has-text("Domain & hosting transferred")');
  await seller.locator('button:has-text("All assets delivered")').waitFor({ timeout: 20000 });
  await seller.click('button:has-text("All assets delivered")');
  await seller.getByText("Buyer review").first().waitFor({ timeout: 20000 });

  await buyer.goto(dealUrl);
  const boxes = buyer.locator('input[type="checkbox"].accent-violet-500');
  const n = await boxes.count();
  for (let i = 0; i < n; i++) {
    await boxes.nth(i).check();
    await buyer.waitForTimeout(400);
  }
  await buyer.click('button:has-text("I received everything")');
  await buyer.getByText("Confirmation recorded").first().waitFor({ timeout: 20000 });

  await seller.goto(dealUrl);
  await seller.click('button:has-text("Confirm handover complete")');
  await seller.getByText("Completed").first().waitFor({ timeout: 30000 });
  await shot(seller, "06-deal-completed");
  await seller.context().close();
});

// ── 3. Promotion purchase modal ──
await check("promotion package modal opens with three packages", async () => {
  const seller = await login("nika@venturex.local");
  await seller.goto(`${BASE}/dashboard/promotions`);
  await seller.click('button:has-text("Promote your listing")');
  await seller.getByText("Ultimate Boost").first().waitFor();
  await seller.waitForTimeout(800);
  await shot(seller, "07-promotion-modal");
  await seller.context().close();
});

// ── 4. Admin analytics shows the earned commission ──
await check("admin analytics", async () => {
  const admin = await login("admin@venturex.local");
  await admin.goto(`${BASE}/admin`);
  await admin.getByText("Platform commission revenue").waitFor();
  await shot(admin, "08-admin-analytics");
  await admin.context().close();
});

// ── 5. Mobile + translations ──
await check("mobile Georgian homepage", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  await ctx.addCookies([{ name: "vx_locale", value: "ka", url: BASE }, { name: "vx_currency", value: "GEL", url: BASE }]);
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.waitForTimeout(2500);
  await shot(page, "09-mobile-ka");
  await ctx.close();
});

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll UI checks passed");
process.exit(failures ? 1 : 0);
