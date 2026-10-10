"use client";

import confetti from "canvas-confetti";

export function celebrate() {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const colors = ["#3b82f6", "#8b5cf6", "#22d3ee", "#f5c451", "#ffffff"];
  const end = Date.now() + 1200;
  (function frame() {
    confetti({ particleCount: 4, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors });
    confetti({ particleCount: 4, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
  confetti({ particleCount: 120, spread: 100, startVelocity: 45, origin: { y: 0.6 }, colors });
}
