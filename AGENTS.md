# Agent notes

For UI work, follow GUI.md and use graphical-ui, graphical-convert, or graphical-audit as appropriate (in `.agents/skills/`). The themed Base UI components live in `components/graphical/` and import from `@graphical`.

## Where the site source lives

This repo's `main` is the source of truth for aisandboxbench.com, and Vercel deploys every push to it. Change the site here, by PR. The early `ship.sh` flow, which rsynced `apps/bench-site` from the sandbox-sdk repo into this one and deleted files that only existed here, stopped on 2026-10-23, and that copy is out of date. Don't revive it: it would delete pages added here, including the SEO pages and verification files in `public/`. Benchmark data still comes from the harness in sandbox-sdk (`bun bench site-data`), written into `src/data/`.

An SEO agent runs twice a day (brief at `~/.config/sandbox-bench/seo/brief.md`). It never edits `src/data/`, the numbers or the methodology. Keep `public/google14363a02f88d13fa.html` (Search Console verification) and the IndexNow key file.
