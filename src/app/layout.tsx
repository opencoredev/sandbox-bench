import { GeistMono } from "geist/font/mono";
import { GeistPixelSquare } from "geist/font/pixel";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { trackScript } from "@/components/track";

import "./globals.css";

const title = "Sandbox bench: cloud sandboxes for agents, measured";
const description =
  "8 cloud sandboxes for AI agents (E2B, Daytona, Upstash Box, Boat, boxd, Freestyle, Tenki, Superserve) timed on cold start, real agent tasks, bursts, reliability and cost, on each default machine and on the same 4 vCPU, 8 GB machine.";

export const metadata: Metadata = {
  title,
  icons: {
    icon: [
      { url: "/favicon-light.svg", type: "image/svg+xml", media: "(prefers-color-scheme: light)" },
      { url: "/favicon-dark.svg", type: "image/svg+xml", media: "(prefers-color-scheme: dark)" },
    ],
  },
  description,
  openGraph: { title, description, type: "website", siteName: "Sandbox bench" },
  twitter: { card: "summary", title, description },
  alternates: { types: { "text/markdown": "/results.md", "application/json": "/results.json" } },
  // Private until launch: flip to index on publish.
  robots: { index: false, follow: false },
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
      <body>{children}</body>
    </html>
  );
}
