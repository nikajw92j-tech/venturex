import { ImageResponse } from "next/og";

export const alt = "VENTUREX — The marketplace where digital businesses change hands";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, backgroundColor: "#03050b", backgroundImage: "radial-gradient(circle at 20% 20%, #1e3a8a 0%, #03050b 55%)", color: "white" }}>
        <div style={{ display: "flex", fontSize: 34, fontWeight: 800, letterSpacing: 10 }}>
          VENTURE<span style={{ color: "#a78bfa" }}>X</span>
        </div>
        <div style={{ marginTop: 40, fontSize: 68, fontWeight: 700, lineHeight: 1.1, maxWidth: 950 }}>The Marketplace Where Digital Businesses Change Hands.</div>
        <div style={{ marginTop: 30, fontSize: 28, color: "#94a3b8" }}>Verified listings · Live auctions · Protected payments</div>
      </div>
    ),
    size,
  );
}
