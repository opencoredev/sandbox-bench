# Styne (archived, not published)

Styne was removed from aisandboxbench.com on 2026-11-28. It had not been approved for publishing. Nothing here is built or served: Next.js only bundles `src/` and serves `public/`.

## What is here

- `*.styne.json`: every entry removed from the file of the same name in `src/data/` (or `scripts/` for `realistic-coverage`). Each entry has the JSON path it sat at in the original file and its value, unchanged.
- `realistic-parts/sbx-styne.json`: moved from `scripts/realistic-parts/`.
- `logos/styne.svg`: moved from `public/logos/`.

The site code and copy that named Styne (its provider entry and CPU caveat in `src/lib/providers.ts`, its hardware, size and billing entries, its provider page and update, and the notes on the home page, the like-for-like checks and the sustained CPU chart) were removed in the same commit.

## How to restore

The whole removal is one squash commit on `main`, so the simplest restore is to revert it:

```sh
git revert <removal commit>
```

That brings back the data, code, copy, tests, logo and both pages exactly as they were at 08ec12dd6ae55048e9e7fddce46653cc9b5934cb. Data from later runs has to be merged by hand after that, or regenerated with `bun bench site-data` in sandbox-sdk with Styne included.
