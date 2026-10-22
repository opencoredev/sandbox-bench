import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { groups } from "@/lib/agent-data";
import { providerInfo } from "@/lib/providers";
import { trackIds } from "@/lib/tracks";

/** Shared art for opengraph-image.tsx and twitter-image.tsx: 1200x630, rendered once at build. */
export const ogSize = { width: 1200, height: 630 };
export const ogAlt = "Sandbox bench: cloud sandboxes for AI agents, measured";

const amber = "#e8a33c";
const paper = "#0b0b0c";
const cell = 6;

// 8x8 Bayer matrix, normalised to thresholds in (0, 1).
const bayer = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
].map((row) => row.map((v) => (v + 0.5) / 64));

// The scope mark from brand.tsx on its 32-unit grid: four corner brackets and the lit centre cell.
const markRects: [x: number, y: number, w: number, h: number][] = [
  [2, 2, 10, 4], [2, 2, 4, 10], [20, 2, 10, 4], [26, 2, 4, 10],
  [2, 26, 10, 4], [2, 20, 4, 10], [20, 26, 10, 4], [26, 20, 4, 10],
  [12, 12, 8, 8],
];
const markCentre = { x: 960, y: 300 };
const markScale = 10; // 320px mark
const inMark = ({ x, y }: { x: number; y: number }) => {
  const u = (x - markCentre.x) / markScale + 16;
  const v = (y - markCentre.y) / markScale + 16;
  return markRects.some(([rx, ry, rw, rh]) => u >= rx && u < rx + rw && v >= ry && v < ry + rh);
};

/** Ordered-dither field: an amber glow behind the mark, the mark itself solid, everything else dark. */
function ditherSvg() {
  const lit: string[] = [];
  const dim: string[] = [];
  for (let row = 0; row * cell < ogSize.height; row++) {
    for (let col = 0; col * cell < ogSize.width; col++) {
      const p = { x: col * cell + cell / 2, y: row * cell + cell / 2 };
      const rect = `<rect x="${col * cell}" y="${row * cell}" width="${cell - 2}" height="${cell - 2}"/>`;
      if (inMark(p)) {
        lit.push(rect);
        continue;
      }
      const d = Math.hypot((p.x - markCentre.x) / 1.15, p.y - markCentre.y);
      const glow = Math.max(0, 1 - d / 430) ** 2.2 * 0.55;
      const threshold = bayer[row % 8]?.[col % 8] ?? 1;
      if (glow > threshold) dim.push(rect);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ogSize.width}" height="${ogSize.height}"><g fill="${amber}" fill-opacity="0.38">${dim.join("")}</g><g fill="${amber}">${lit.join("")}</g></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const font = (dir: string, file: string) => readFile(join(process.cwd(), "node_modules/geist/dist/fonts", dir, file));

export async function renderOgImage() {
  const [sans, sansBold, mono] = await Promise.all([
    font("geist-sans", "Geist-Regular.ttf"),
    font("geist-sans", "Geist-SemiBold.ttf"),
    font("geist-mono", "GeistMono-Regular.ttf"),
  ]);
  const providers = Object.values(providerInfo).map((p) => p.name);
  const tests = groups.reduce((n, g) => n + g.ids.length, 0);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: paper, color: "#f4f4f4", fontFamily: "Geist" }}>
        <img src={ditherSvg()} width={ogSize.width} height={ogSize.height} style={{ position: "absolute", top: 0, left: 0 }} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", width: 760, height: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em" }}>
            <svg width="30" height="30" viewBox="0 0 32 32">
              <path fill={amber} d="M2 2h10v4H6v6H2zM30 2v10h-4V6h-6V2zM2 30V20h4v6h6v4zM30 30H20v-4h6v-6h4zM12 12h8v8h-8z" />
            </svg>
            <span>Sandbox</span>
            <span style={{ fontWeight: 400, color: "#a8a8a8", marginLeft: -6 }}>bench</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
            <div style={{ fontSize: 76, fontWeight: 600, lineHeight: 1.02, letterSpacing: "-0.04em", display: "flex", flexDirection: "column" }}>
              <span>Cloud sandboxes</span>
              <span>for AI agents,</span>
              <span style={{ color: amber }}>measured.</span>
            </div>
            <div style={{ display: "flex", gap: 28, fontFamily: "Geist Mono", fontSize: 22, color: "#d6d6d6" }}>
              <span><span style={{ color: amber }}>{providers.length}</span>&nbsp;providers</span>
              <span><span style={{ color: amber }}>{tests}</span>&nbsp;tests</span>
              <span><span style={{ color: amber }}>{trackIds.length}</span>&nbsp;machine tracks</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", fontFamily: "Geist Mono", fontSize: 18, color: "#8a8a8a", lineHeight: 1.5 }}>
            {[providers.slice(0, 4), providers.slice(4)].map((line) => (
              <span key={line.join()}>{line.join("  ·  ")}</span>
            ))}
          </div>
        </div>
        <div style={{ position: "absolute", right: 72, bottom: 58, display: "flex", fontFamily: "Geist Mono", fontSize: 20, color: "#a8a8a8" }}>
          aisandboxbench.com
        </div>
      </div>
    ),
    {
      ...ogSize,
      fonts: [
        { name: "Geist", data: sans, weight: 400, style: "normal" },
        { name: "Geist", data: sansBold, weight: 600, style: "normal" },
        { name: "Geist Mono", data: mono, weight: 400, style: "normal" },
      ],
    },
  );
}
