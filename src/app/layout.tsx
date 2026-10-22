import { GeistMono } from "geist/font/mono";
import { GeistPixelSquare } from "geist/font/pixel";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { trackScript } from "@/components/track";
import { TracePanel } from "@/components/trace-panel";

import "./globals.css";

const title = "Sandbox bench: cloud sandboxes for agents, measured";
const description =
  "8 cloud sandboxes for AI agents (E2B, Daytona, Upstash Box, Boat, boxd, Freestyle, Tenki, Superserve) timed on cold start, real agent tasks, bursts, reliability and cost, on each default machine and on the same 4 vCPU, 8 GB machine.";

export const metadata: Metadata = {
  title,
  icons: {
    icon: [
      { url: "/mark.ico", sizes: "16x16 32x32 48x48" },
      { url: "/mark.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-icon.png",
  },
  description,
  openGraph: { title, description, type: "website", siteName: "Sandbox bench", url: "https://aisandboxbench.com" },
  twitter: { card: "summary_large_image", title, description },
  metadataBase: new URL("https://aisandboxbench.com"),
  alternates: { canonical: "/", types: { "text/markdown": "/results.md", "application/json": "/results.json" } },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${GeistSans.variable} ${GeistMono.variable} ${GeistPixelSquare.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: trackScript }} />
      </head>
      <body>
        {children}
        <TracePanel />
      </body>
    </html>
  );
}
