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
 * - The `stress` block of benchmark.<track>.json: site-data's `--stress-report`
 *   option (bench/src/stress-site.ts), from a separately merged stress report.
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
  /** Already multiplied by `regionMultiplier`, like `hourly`. */
  commonHourly: number | null;
  perVcpuHour: number | null;
  /**
   * How the hourly price relates to the bill: "lower" when it is a lower bound
   * (Modal's default track bills burst usage above its 0.125 CPU / 128 MiB
   * request). Null without a price; absent in exports made before SBX-103.
   */
  pricingBound?: string | null;
  /** The region the source runs were pinned to, which sets `regionMultiplier`. Null when unpinned. */
  pricingRegion?: string | null;
  /** The region price multiplier already in `hourly` and `commonHourly` (Modal pinned to us-east: 1.75). 1 when none applies. */
  regionMultiplier?: number;
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
  /**
   * For a provider with no pause call whose sandbox goes on standby by itself
   * when idle (Baseten): the median resume, the first command after standby, in
   * seconds, how long each attempt sent no requests and the median standby gap
   * the sandbox's own ticker showed. Its pause-resume metric is resume alone.
   * Absent in exports made before it, null for every other provider.
   */
  standbyResume?: StandbyResumeExport | null;
  /** From the cost suite, once the harness exports it; absent until then. See readCostPerTask in data.ts. */
  costPerTask?: CostPerTaskExport | null;
}

/** The harness's standbyResume (bench/src/site-data.ts), in seconds. */
export interface StandbyResumeExport {
  resume: number;
  idleS: number;
  medianGapS: number;
  n: number;
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
  /** False while the provider can still change the amount (Daytona settles up to 48 hours later). */
  settled: boolean;
  /**
   * For an estimate, how it relates to the bill: "lower" is a lower bound
   * (Modal's list-price fallback on its default track), "exact" or
   * "observed" otherwise. Null for billed and metered amounts; absent in
   * exports made before SBX-103.
   */
  bound?: string | null;
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

/**
 * What a provider's main-suite export left out or reran, as the harness's
 * site-data step writes it (per track, for one provider's merge): samples
 * removed by reason, iterations superseded by a rerun and why, scenarios not
 * run, and scenarios whose data came from replacement runs.
 */
export interface ExclusionsExport {
  removed: Readonly<Record<string, number>> | null;
  superseded: readonly { provider: string; suite: string; sourceRunId: string; iterations: readonly number[]; rerunSourceRunIds: readonly string[]; reason: string }[];
  notRun: readonly { provider: string; suite: string; scenario: string; reason: string }[];
  replacements: readonly { provider: string; suite: string; scenario: string; sourceRunIds: readonly string[] }[];
}

export interface SiteExport {
  track: string;
  generatedFrom: string;
  window: { start: string; end: string };
  runs: readonly { id: string; suite: string; samples: number }[];
  /** Source runs discarded in full before merging, with why. */
  excluded: readonly { runId: string; reason: string }[];
  /**
   * Per provider, the harness's exclusions for that provider's merge (Modal's
   * applied rows carry one). Keyed by provider because removed counts describe
   * that provider's runs only, not the whole track.
   */
  exclusions?: Readonly<Record<string, ExclusionsExport>>;
  providers: readonly SiteProviderExport[];
  metrics: readonly SiteMetricExport[];
  coldSamples: Readonly<Record<string, readonly number[]>>;
  /** Where a chart's data comes from when it is not this export's main run, keyed by metric id or "cost". */
  sourceNotes?: Readonly<Record<string, string>>;
  /** Why a provider has no result on a chart, worked out from the runs, keyed by metric id then provider. */
  missing?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** CPU sustained, CPU under burst and burst survival (bench/src/stress-site.ts); absent in exports made before it. */
  stress?: StressExport;
}

/** The allocation a stress row was collected at, as the harness records it. */
export interface StressAllocationExport {
  requestedSize: SiteProviderExport["requestedAllocation"]["size"];
  template: string | null;
}

/** Failures by the harness's taxonomy: only `provider` counts against the provider. */
export interface StressFailuresExport {
  accountLimit: number;
  clientNetwork: number;
  provider: number;
}

/** Per-run throughput, ops/s: median, p95 and the bootstrap 95% interval of the median. */
export interface StressThroughputExport {
  n: number;
  p50: number | null;
  p95: number | null;
  min: number | null;
  max: number | null;
  ciLow: number | null;
  ciHigh: number | null;
}

/** Median and minimum of a per-run ratio, null when no run recorded it. */
export type StressRatioExport = { p50: number | null; min: number | null } | null;

/** Per-sandbox throughput across cohorts, ops/s: the fastest over the slowest and the coefficient of variation. */
export interface StressSpreadExport {
  n: number;
  p50: number | null;
  p95: number | null;
  min: number | null;
  max: number | null;
  mean: number | null;
  maxOverMin: number | null;
  cv: number | null;
}

export interface CpuSustainedExport extends StressAllocationExport {
  provider: string;
  single: StressThroughputExport;
  all: StressThroughputExport;
  singleSeconds: { p50: number | null; max: number | null } | null;
  allSeconds: { p50: number | null; max: number | null } | null;
  /** Slowest segment over the median segment, per run: 1 is perfectly even. */
  consistency: { single: StressRatioExport; all: StressRatioExport };
  /** Last quarter of segments over the first quarter, per run: below 1 the guest slowed. */
  trend: { single: StressRatioExport; all: StressRatioExport };
  guestVcpus: readonly { value: number; count: number }[];
  workers: readonly { value: number; count: number }[];
  attempts: { successes: number; failures: StressFailuresExport; blocked: number; skipped: number };
}

export interface CpuBurstExport extends StressAllocationExport {
  provider: string;
  work: { segments: number; steps: number } | null;
  cohorts: number;
  completeCohorts: number;
  excluded: { lowOverlap: number; invalidEvidence: number };
  incomplete: { cohorts: number; members: number };
  members: { attempted: number; ready: number; completed: number };
  failures: StressFailuresExport;
  perSandbox: { cohorts: number; single: StressSpreadExport; all: StressSpreadExport };
  withinCohortMaxOverMin: { p50: number | null; max: number | null } | null;
  dispatchSkewMs: { p50: number | null; max: number | null } | null;
  allCompleteS: { n: number; p50: number | null; max: number | null } | null;
}

export interface BurstSurvivalExport extends StressAllocationExport {
  provider: string;
  windowS: number | null;
  heartbeatS: number | null;
  cohorts: number;
  incomplete: { cohorts: number; members: number };
  attempted: number;
  survived: number;
  createFailed: StressFailuresExport & { total: number };
  died: number;
  unresponsive: number;
  interrupted: number;
  invalidEvidence: number;
  invalidReasons: Readonly<Record<string, number>>;
  windowFailures: StressFailuresExport;
  /** Survived over members the provider had a fair chance with; null when there were none. */
  survivalRate: number | null;
}

/** The harness's `StressData` (bench/src/stress-site.ts), one per track. */
export interface StressExport {
  observations: number;
  runs: readonly { id: string; suite: string; samples: number }[];
  /** Stress rows the attempt policy removed, by reason. */
  selectionRemoved: Readonly<Record<string, number>>;
  cpuSustained: readonly CpuSustainedExport[];
  cpuBurst: readonly { k: number; providers: readonly CpuBurstExport[] }[];
  burstSurvival: readonly { k: number; providers: readonly BurstSurvivalExport[] }[];
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
