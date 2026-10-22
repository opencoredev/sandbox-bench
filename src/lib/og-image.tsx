import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

/** Shared art for opengraph-image.tsx and twitter-image.tsx: 1200x630, rendered once at build. */
export const ogSize = { width: 1200, height: 630 };
export const ogAlt = "Sandbox bench: cloud sandboxes for AI agents, measured";

const amber = "#f5b14c";
const shadow = "0 2px 18px rgba(8, 28, 64, 0.45)";

const font = (dir: string, file: string) => readFile(join(process.cwd(), "node_modules/geist/dist/fonts", dir, file));

export async function renderOgImage() {
  const [sans, sansBold, mono, art] = await Promise.all([
    font("geist-sans", "Geist-Regular.ttf"),
    font("geist-sans", "Geist-SemiBold.ttf"),
    font("geist-mono", "GeistMono-Regular.ttf"),
    readFile(join(process.cwd(), "src/assets/og-art.jpg")),
  ]);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", color: "#ffffff", fontFamily: "Geist" }}>
        {/* Pixel-art park with a sandbox, generated with Gemini. The left half is open sky and grass for the type. */}
        <img src={`data:image/jpeg;base64,${art.toString("base64")}`} width={ogSize.width} height={ogSize.height} style={{ position: "absolute", top: 0, left: 0 }} />
        {/* Shade the pale lower-left grass so the white subtitle keeps its contrast. */}
        <div style={{ position: "absolute", left: 0, bottom: 0, width: 760, height: 330, display: "flex", backgroundImage: "linear-gradient(20deg, rgba(10, 34, 22, 0.62) 0%, rgba(10, 34, 22, 0.34) 45%, rgba(10, 34, 22, 0) 80%)" }} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "70px 64px 60px", width: 720, height: "100%" }}>
          <div style={{ fontSize: 70, fontWeight: 600, lineHeight: 1.06, letterSpacing: "-0.035em", display: "flex", flexDirection: "column", textShadow: shadow }}>
            <span>Cloud sandboxes</span>
            <span>for AI agents,</span>
            <span>measured</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div style={{ fontSize: 29, lineHeight: 1.35, letterSpacing: "-0.01em", maxWidth: 600, textShadow: shadow }}>
              Cold starts, agent work, cost and reliability for E2B, Daytona, Upstash, boxd, Freestyle, Tenki and Superserve.
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: "Geist Mono", fontSize: 21, textShadow: shadow }}>
              <svg width="22" height="22" viewBox="0 0 32 32">
                <path fill={amber} d="M2 2h10v4H6v6H2zM30 2v10h-4V6h-6V2zM2 30V20h4v6h6v4zM30 30H20v-4h6v-6h4zM12 12h8v8h-8z" />
              </svg>
              <span>aisandboxbench.com</span>
            </div>
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
      ],
    },
  );
}
