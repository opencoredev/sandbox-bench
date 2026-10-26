import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

/** Shared art for opengraph-image.tsx and twitter-image.tsx: 1200x630, rendered once at build. */
export const ogSize = { width: 1200, height: 630 };
export const ogAlt = "Sandbox bench: cloud sandboxes for AI agents, measured";

const background = "#0a0a0a";
const brand = "#e8a33c";
const foreground = "#f2f2f2";
const muted = "#a3a3a3";

/** Where src/assets/og-art.png sits on the card, and the laptop inside it that the scope brackets frame. */
const art = { left: 440, width: 760 };
const scope = { left: art.left + 414, top: 350, width: 128, height: 112, arm: 20, stroke: 4 };

const font = (dir: string, file: string) => readFile(join(process.cwd(), "node_modules/geist/dist/fonts", dir, file));

function Bracket({ corner }: { corner: "tl" | "tr" | "bl" | "br" }) {
  const top = corner[0] === "t";
  const left = corner[1] === "l";
  const edge = `${scope.stroke}px solid ${brand}`;
  return (
    <div
      style={{
        position: "absolute",
        width: scope.arm,
        height: scope.arm,
        ...(top ? { top: scope.top, borderTop: edge } : { top: scope.top + scope.height - scope.arm, borderBottom: edge }),
        ...(left ? { left: scope.left, borderLeft: edge } : { left: scope.left + scope.width - scope.arm, borderRight: edge }),
      }}
    />
  );
}

export async function renderOgImage() {
  const [sans, sansBold, mono, pixel, scene] = await Promise.all([
    font("geist-sans", "Geist-Regular.ttf"),
    font("geist-sans", "Geist-SemiBold.ttf"),
    font("geist-mono", "GeistMono-Regular.ttf"),
    // Satori can't read the package's woff2, so the pixel face is checked in as a TTF.
    readFile(join(process.cwd(), "src/assets/GeistPixel-Square.ttf")),
    readFile(join(process.cwd(), "src/assets/og-art.png")),
  ]);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background, color: foreground, fontFamily: "Geist" }}>
        {/*
          The golden-hour sandbox scene, Bayer 8x8 ordered-dithered to three tones of
          brand amber on the page background at 2px cells. Its left edge dissolves
          into the page through the threshold map, so there is no seam behind the type.
        */}
        <img src={`data:image/png;base64,${scene.toString("base64")}`} width={art.width} height={ogSize.height} style={{ position: "absolute", top: 0, left: art.left }} />
        <Bracket corner="tl" />
        <Bracket corner="tr" />
        <Bracket corner="bl" />
        <Bracket corner="br" />

        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "60px 64px 56px", width: 660, height: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em" }}>
            <svg width="26" height="26" viewBox="0 0 32 32">
              <path fill={brand} d="M2 2h10v4H6v6H2zM30 2v10h-4V6h-6V2zM2 30V20h4v6h6v4zM30 30H20v-4h6v-6h4zM12 12h8v8h-8z" />
            </svg>
            <span>Sandbox</span>
            <span style={{ fontWeight: 400, color: muted, marginLeft: -6 }}>bench</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
            <div style={{ display: "flex", flexDirection: "column", fontFamily: "Geist Pixel", fontSize: 56, lineHeight: 1.08, letterSpacing: "-0.025em" }}>
              <span>Cloud sandboxes</span>
              <span>for AI agents,</span>
              <span style={{ color: brand }}>measured.</span>
            </div>
            <div style={{ fontSize: 24, lineHeight: 1.4, letterSpacing: "-0.01em", color: muted, maxWidth: 470 }}>
              Cold starts, agent work, cost and reliability, tested the same way on each.
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontFamily: "Geist Mono", fontSize: 18, color: muted }}>
            <span>E2B · Daytona · boxd · Freestyle</span>
            <span>Tenki · Superserve</span>
            <span>Upstash Box · Upstash Ephemeral Box</span>
            <span style={{ color: brand, marginTop: 8 }}>aisandboxbench.com</span>
          </div>
        </div>
      </div>
    ),
    {
      ...ogSize,
      fonts: [
        { name: "Geist", data: sans, weight: 400, style: "normal" },
        { name: "Geist", data: sansBold, weight: 600, style: "normal" },
        { name: "Geist Mono", data: mono, weight: 400, style: "normal" },
        { name: "Geist Pixel", data: pixel, weight: 400, style: "normal" },
      ],
    },
  );
}
