# Boat Benchmark & Tool-Replay Logs (`sbx65-r1` Multi-Region Run)

Date: October 25-26, 2026
Benchmark suite: `@computesdk/bench` (`sandbox-bench` multi-region harness `sbx65-r1`)

## 1. Test Setup & Runner Locations
- **Boat Sandbox Fingerprint:** AMD Ryzen 9 9950X 16-Core (2 vCPU allocated, 3.8 GiB RAM, 19.5 GiB disk), hosted in **Northern France (`fr-north`, OVH AS16276)**.
- **Runner 1 — `EU-Central` (`eu`):** Hetzner Cloud (`eu-central`, Falkenstein/Nuremberg, Germany) -> ~13 ms network RTT to Boat `fr-north`.
- **Runner 2 — `US-East` (`us-east`):** Bare-metal runner in Boca Raton, Florida (`us-east`) -> ~105 ms transatlantic network RTT to Boat `fr-north`.
- Each runner executed 2 independent interleaved batches (`b1` and `b2`), totaling **20 samples** for core lifecycle/I/O scenarios and **6 samples** for workload scenarios (`tool-replay`, `edit-loop`, `git-clone`, `npm-install`, `pip-install`, `dev-server`, `preview-first-byte`).

---

## 2. Boat Headline Results (`EU-Central` vs `US-East`)

| Scenario | `EU-Central` p50 (p95) | `US-East` p50 (p95) | Spread (`US-East` / `EU`) | Notes |
|---|---:|---:|---:|---|
| **Cold start (`cold`)** | **780 ms** (1.53 s) | **1.15 s** (1.73 s) | 1.47x | Competitive in EU (#3 behind E2B 667ms & Superserve 712ms) |
| **Command exec (`command`)** | **114 ms** (185 ms) | **333 ms** (361 ms) | 2.92x | Fastest in EU (#1 of 9 providers: 114 ms) |
| **1 KB file R/W (`files-1kb`)** | **428 ms** (816 ms) | **818 ms** (941 ms) | 1.91x | Multi-round-trip overhead on file read/write |
| **10 MB file R/W (`files-10mb`)** | **3.45 s** (11.23 s) | **7.03 s** (25.83 s) | 2.04x | 1/20 timeout/error on US-East |
| **Agent tool replay (`tool-replay`)** | **23.34 s** (25.88 s) | **42.71 s** (43.17 s) | 1.83x | 100 sequential tool ops; 1/6 `unavailable` error in EU (`eu-b1` iter 0) |
| **Edit loop (`edit-loop`)** | **471 ms** (619 ms) | **1.16 s** (1.97 s) | 2.46x | #2 fastest in EU behind Boxd (262 ms) |
| **Reconnect (`reconnect`)** | **252 ms** (439 ms) | **701 ms** (977 ms) | 2.78x | #1 fastest in EU (252 ms) |
| **Preview TTFB (`preview-first-byte`)** | **131 ms** (202 ms) | **989 ms** (1.23 s) | 7.57x | #2 fastest in EU behind Boxd (70 ms) |
| **Destroy (`destroy`)** | **73 ms** (150 ms) | **176 ms** (331 ms) | 2.40x | #2 fastest in EU behind Boxd (27 ms) |
| **CPU multi-core (`cpu-all`)** | **53.6M iter/s** | **49.3M iter/s** | 1.09x | **#1 fastest across all 9 providers** (Ryzen 9 9950X) |
| **CPU single-core (`cpu-single`)** | **19.0M iter/s** | **18.3M iter/s** | 1.04x | **#1 fastest across all 9 providers** |
| **Disk 4K random read IOPS** | **766k IOPS** | **589k IOPS** | 1.30x | **#1 fastest across all 9 providers** |

---

## 3. Why `tool-replay` Takes ~21-23s in EU and ~42.7s from US-East

`tool-replay` runs **20 steps x 5 operations per step = 100 sequential coding-agent operations** (`write`, `read`, `edit`, `ls`, `grep`, `test`) on an active sandbox. Every individual step's duration is recorded in `samples.ndjson` under `.phases` (and extracted into `tool-replay-traces.json` in this archive).

### Per-Operation Latency Breakdown Across All Successful `tool-replay` Runs

| Operation Type | Count per Run | `EU-Central` p50 (mean / min-max) | `US-East` p50 (mean / min-max) | Delta (`US-East` - `EU`) | Implied Sequential RTTs |
|---|---:|---:|---:|---:|---|
| **`read`** | 20 | **107.7 ms** (111.7 ms / 99-216 ms) | **217.5 ms** (221.3 ms / 207-325 ms) | **+110 ms** | ~1 RTT (+ ~95 ms server/daemon overhead) |
| **`ls`** | 16 | **113.4 ms** (117.6 ms / 102-228 ms) | **226.4 ms** (233.2 ms / 214-342 ms) | **+113 ms** | ~1 RTT (+ ~100 ms server/daemon overhead) |
| **`grep`** | 16 | **115.6 ms** (117.1 ms / 108-137 ms) | **321.4 ms** (323.5 ms / 309-344 ms) | **+206 ms** | ~2 RTTs (+ ~95 ms server/daemon overhead) |
| **`test`** | 8 | **116.4 ms** (205.5 ms / 109-621 ms) | **325.4 ms** (418.7 ms / 315-844 ms) | **+209 ms** | ~2 RTTs (+ test execution time) |
| **`write`** | 20 | **235.1 ms** (235.6 ms / 217-349 ms) | **573.8 ms** (575.5 ms / 546-617 ms) | **+339 ms** | **~3 sequential RTTs** per file write |
| **`edit`** | 20 | **366.8 ms** (366.9 ms / 319-518 ms) | **807.4 ms** (806.4 ms / 762-875 ms) | **+441 ms** | **~4 sequential RTTs** per file edit (read + write) |
| **Total (100 ops)** | **100** | **~21.2s - 23.3s** | **~42.6s - 42.8s** | **+20.4s** | ~200 total network RTTs + ~10s server-side per-call overhead |

### Key Takeaways for Boat Engineering
1. **Per-call control-plane / exec overhead (~95-100 ms floor):**
   Even from `EU-Central` (~13 ms network RTT to Northern France), the fastest possible `read` or `ls` call takes **100-115 ms**. Across 100 sequential calls, that fixed ~100 ms server-side overhead accounts for **~10 seconds** of floor latency.
2. **Multi-RTT `write` and `edit` operations:**
   - A single 1 KB `write` takes **235 ms in EU** (~2x a `read`) and **574 ms from US-East** (+339 ms over EU, which is **3x the ~110 ms transatlantic RTT**).
   - A single `edit` takes **367 ms in EU** and **807 ms from US-East** (+441 ms over EU, or **4x the transatlantic RTT**).
   - Together, the 20 `write` + 20 `edit` calls alone take **~12.0s in EU** and **~27.6s from US-East** (65% of the entire `tool-replay` runtime!). Collapsing `write` into a single-RTT request and supporting native single-RTT file `write` / `edit` (or persistent streaming RPC over WebSocket/HTTP2) would cut `tool-replay` latency by >50%.
3. **Transient `code: "unavailable"` under sustained sequential calls:**
   - In `eu-b1-boat` iteration 0 (`sandboxId: d7fa8657-e05e-4e64-9a4a-9452ca0090ab`), `tool-replay` failed at **26,881 ms** on step 19 with `SandboxError: unavailable` (`stage: "tool-replay"`). All other 11/12 `tool-replay` iterations across EU and US-East succeeded.

---

## 4. Files in This Archive
- `README.md` — This summary and bottleneck breakdown.
- `tool-replay-traces.json` — Extracted per-step timing traces (`step-0-write` .. `step-19-test`) and outcomes for all 12 Boat `tool-replay` iterations across `eu` and `us-east`.
- `all-providers-regional-comparison.md` / `.json` — Full 9-provider regional comparison (`eu` vs `us-east`) from `sbx65-r1`.
- `eu-b1-boat/` — Full raw artifacts (`results.json`, `results.md`, `samples.ndjson`, `job.log`, `index.html`) for EU batch 1.
- `eu-b2-boat/` — Full raw artifacts for EU batch 2.
- `us-east-b1-boat/` — Full raw artifacts for US-East batch 1.
- `us-east-b2-boat/` — Full raw artifacts for US-East batch 2.
