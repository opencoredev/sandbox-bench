# Sandboxer archive

Sandboxer is shutting down. Its own site says service ends on Friday, November 27, 2026 at 9:00 PM ET, so we removed it from the benchmark on 2026-11-28. Sandboxer's results reached the live site on Oct 26, 2026 and were held from it the same day (commit 8b81c4d).

Nothing in this folder is served by the site or read by the build. It is kept so the results can be checked or brought back.

## What's here

- `site-data/`: the Sandboxer parts of each `src/data/*.json` file as they stood at commit 12896e1, the last commit before Sandboxer was held. Each file keeps its source file's track, window and provenance fields, and `archivedFrom` names the file and commit.
- `raw/sbx61-runs.tar.gz`: harness output for every Sandboxer run on Oct 22 and 23, 2026, on both tracks: the pilots and the main, snapshot, cost and burst suites. The published runs are `sbx61-<track>-sandboxer-r3-main`, `-r2-snapshot`, `-r2-cost` and `-r2-burst`.
- `raw/sbx65-regions.tar.gz`: Sandboxer's caller-location runs from Frankfurt and US East (batches sbx65-r1 to sbx65-r3, Oct 26 and 28, 2026), with the batch manifests and logs.
- `sandboxer.svg`: the logo the site used.

In the raw files, preview URL tokens and preview cookies, two caller IP addresses (our runner's and a home network's) and runner-local home paths are replaced with `redacted` or `~/`. Nothing else was changed.

## Restore

The full data files, with Sandboxer in them, are in git history:

```sh
git show 12896e1:src/data/benchmark.default.json
```

The site code that showed Sandboxer (provider list, hardware notes, colors, logo) was taken out in 8b81c4d, so `git revert 8b81c4d` on a branch is the starting point, then resolve it against current main. Unpack the raw runs with `tar -xzf raw/sbx61-runs.tar.gz`.

The Sandboxer adapter still ships in `@opencoredev/sandbox-sdk`. A new run would need a working Sandboxer account, and the service has ended.
