// Renders the ad spots in venturex-ads.html to MP4 with the locally installed Chrome.
// Usage: node marketing/ads/render.mjs [--url yourdomain.com] [--stills]
import { chromium } from "playwright-core";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const url = args.includes("--url") ? args[args.indexOf("--url") + 1] : "";
const stills = args.includes("--stills");

const candidates = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));
if (!executablePath) throw new Error("No Chrome or Edge found. Set CHROME_PATH.");

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.goto(pathToFileURL(path.join(dir, "venturex-ads.html")).href);
await page.waitForFunction(() => window.renderAd && window.Mp4Muxer);
await page.evaluate((u) => (window.adState.url = u), url);

const out = path.join(dir, "out");
mkdirSync(out, { recursive: true });
const ads = await page.evaluate(() => window.ADS.map((a) => a.id));

if (stills) {
  const times = [1.5, 4.5, 8.5, 10.6, 13.5];
  for (const [i, id] of ads.entries()) {
    for (const t of times) {
      const b64 = await page.evaluate(async ([i, t]) => {
        await document.fonts.ready;
        const c = document.createElement("canvas"); c.width = 1080; c.height = 1920;
        window.ADS[i].draw(c.getContext("2d"), t);
        return c.toDataURL("image/jpeg", 0.7).split(",")[1];
      }, [i, t]);
      writeFileSync(path.join(out, `still-${id}-${t}.jpg`), Buffer.from(b64, "base64"));
    }
  }
  console.log("stills written to", out);
} else {
  for (const [i, id] of ads.entries()) {
    const started = Date.now();
    const b64 = await page.evaluate((i) => window.renderAd(i), i);
    const file = path.join(out, `venturex-${id}-1080x1920.mp4`);
    writeFileSync(file, Buffer.from(b64, "base64"));
    console.log(`${file} (${(b64.length * 0.75 / 1e6).toFixed(1)} MB, ${((Date.now() - started) / 1000).toFixed(0)}s)`);
  }
}
await browser.close();
