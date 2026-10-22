/**
 * The shapes of the data files in src/data, as written by the tools that make
 * them. data.ts is the only reader: it checks each file against these types at
 * compile time and turns them into the site's own model. When the harness
 * changes its export, this file and data.ts are the two places to update.
 *
 * - benchmark.<track>.json: `bun bench site-data --track <track>` (bench/src/site-data.ts).
 * - extras.<track>.json: `bun run extras` in this app (scripts/site-extras.ts),
 *   from the same merged report.
 * - traces.<track>.json: `bun run traces` in this app (scripts/site-traces.ts),
 *   from a run's samples.ndjson.
 *
 * JSON imports widen string literals to `string`, so enum-like fields are
 * typed as strings here and narrowed in data.ts.
 */

export interface AllocationExport {
  cpu: number;
  memoryGiB: number;
  diskGiB: number;
}

export interface SiteProviderExport {
  id: string;
  track: string;
  requestedAllocation: {
    /** A preset name, an explicit size, or null for the provider's default. */
    size: string | { cpu: number; memoryMb: number; diskGb?: number } | null;
    template: string | null;
    compute: { cpu: number; memoryGiB: number } | null;
  };
  measuredAllocations: readonly AllocationExport[];
  equalSpec: boolean;
  currency: string | null;
  hourly: number | null;
  commonHourly: number | null;
  perVcpuHour: number | null;
  pricingAllocation: { cpu: number; memoryGiB: number } | null;
  allocationVerification: { verified: boolean | null; mismatches: readonly string[] };
  pricingSource: string | null;
  pricingNotes: string | null;
  hardware: {
    vcpu: number;
    memoryGiB: number;
    diskGiB: number;
    cpuModels: readonly { value: string; count: number }[];
    vendor: string;
    isolation: string;
    location: readonly { value: string; count: number }[];
  } | null;
  failureReasons: readonly {
    kind: string;
    reason: string;
    count: number;
    runs: number;
    tests: readonly string[];
    /** Failure cause fields, in exports that record them. */
    status?: number | null;
    code?: string | null;
    stage?: string | null;
  }[];
  ourFailures: readonly { reason: string; count: number; runs: number }[];
  pauseSplit: { pause: number; resume: number; n: number } | null;
  /** From the cost suite, once the harness exports it; absent until then. See readCostPerTask in data.ts. */
  costPerTask?: CostPerTaskExport | null;
}

/**
 * The cost suite's result for one provider: each sandbox is created, runs
 * one 100-call tool replay and is deleted, and billing is read per sandbox.
 * `kind` is "billed", "metered" or "estimate"; `n` is how many such tasks.
 */
export interface CostPerTaskExport {
  /** Null until the cost run has a settled amount. */
  usd: number | null;
  kind: string;
  source: string | null;
  confidence: string | null;
  n: number;
}

export interface SiteMetricExport {
  id: string;
  label: string;
  unit: string;
  better: string;
  values: readonly {
    provider: string;
    n: number;
    p50: number | null;
    p95: number | null;
    ciLow: number | null;
    ciHigh: number | null;
    failures: number;
    ourFailures: number;
    limitFailures: number;
    /** Attempts a provider failure on the same sandbox stopped before they began, and why. */
    blocked?: number;
    blockedNote?: string;
  }[];
}

export interface SiteExport {
  track: string;
  generatedFrom: string;
  window: { start: string; end: string };
  runs: readonly { id: string; suite: string; samples: number }[];
  /** Source runs discarded in full before merging, with why. */
  excluded: readonly { runId: string; reason: string }[];
  providers: readonly SiteProviderExport[];
  metrics: readonly SiteMetricExport[];
  coldSamples: Readonly<Record<string, readonly number[]>>;
}

export interface ExtrasProviderExport {
  id: string;
  /** Create until the SDK handle was ready, and the SDK's own share of it, over successful cold starts. */
  sdkReady: { p50: number; p95: number; setupP50: number; n: number } | null;
}

export interface ExtrasExport {
  track: string;
  generatedFrom: string;
  providers: readonly ExtrasProviderExport[];
}

/** Cold start parts, ms, in the order they run. Only create and firstCommand count toward cold start. */
export interface ColdPhases {
  create: number;
  /** Our benchmark's ownership check: excluded from every number. */
  verify: number;
  /** Our benchmark's journal write: excluded from every number. */
  persist: number;
  firstCommand: number;
  /** Sandbox SDK's own setup after the first command. */
  sdkSetup: number;
}

/** Pause + resume parts, ms, in the order they run. */
export interface PausePhases {
  pause: number;
  resume: number;
  /** The first command after resume returned. */
  firstCommand: number;
}

/** traces.<track>.json, from `bun run traces` (scripts/site-traces.ts). */
export interface TraceProviderExport {
  id: string;
  cold: { n: number; median: ColdPhases } | null;
  pauseResume: { n: number; median: PausePhases } | null;
  replay: {
    n: number;
    totalP50: number;
    ops: readonly { op: string; n: number; p50: number; p95: number }[];
    /** The attempt with the median total, step by step. */
    sample: readonly { op: string; ms: number }[];
  } | null;
}

export interface TracesExport {
  track: string;
  generatedFrom: string;
  providers: readonly TraceProviderExport[];
}
