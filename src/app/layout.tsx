import type { Metadata, Viewport } from "next";
import type { CSSProperties, ReactNode } from "react";

import { theme } from "@graphical/theme";
import { previewCssVariables } from "@graphical/lib/theme-model";
import type { ColorMode } from "@graphical/lib/theme-model";
import { Theme } from "@/components/theme";
import { trackScript } from "@/components/track";
import { TracePanel } from "@/components/trace-panel";
import { PostHogProvider } from "@/lib/posthog-provider";

import "./globals.css";

const title = "Sandbox bench: cloud sandboxes for agents, measured";
const description =
  "8 cloud sandbox providers for AI agents (E2B, Daytona, Upstash Box and Ephemeral Box, Boat, boxd, Freestyle, Tenki, Superserve) timed on cold start, real agent tasks, bursts, reliability and cost, on each default machine and on the same 4 vCPU, 8 GB machine.";

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
  // Agents find the data from the page head rather than a block on the page: llms.txt, the Markdown and the JSON.
  alternates: { canonical: "/", types: { "text/plain": "/llms.txt", "text/markdown": "/results.md", "application/json": "/results.json" } },
  robots: { index: true, follow: true },
};

// The site is dark only.
const colorMode: ColorMode = "dark";

// Dark browser chrome too (scrollbars, overscroll, the phone status bar), in the theme's page colour.
export const viewport: Viewport = { colorScheme: "dark", themeColor: theme.theme.colors.dark["neutral-1"] };

// The theme's variables on <html> as well as on the provider, so the page background and
// portalled popups get them too.
const themeVariables: CSSProperties = { ...previewCssVariables(theme.theme, colorMode), colorScheme: colorMode };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={colorMode} style={themeVariables}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: trackScript }} />
        <link rel="preload" href="/fonts/Geist-Variable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/GeistMono-Variable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        {/* Without scripts the themed disclosures cannot open, so show every panel, undoing its closed and
            starting styles. In the base layer: important declarations in an earlier layer beat the theme's. */}
        <noscript>
          <style>{`@layer base { :is([data-ui-component="collapsible"], [data-ui-component="accordion"])[data-ui-part="panel"][hidden] { display: block !important; height: auto !important; opacity: 1 !important; grid-template-rows: 1fr !important; } }`}</style>
        </noscript>
      </head>
      <body>
        <Theme colorMode={colorMode}>
          {children}
          <TracePanel />
        </Theme>
        <PostHogProvider />
      </body>
    </html>
  );
}
