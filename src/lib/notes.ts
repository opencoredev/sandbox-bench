import type { Allocation, Provider, Track, TrackId } from "@/lib/data";
import { formatGiB, formatValue } from "@/lib/format";
import { isProviderId, providerInfo } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers";

export type Notes = Partial<Record<ProviderId, string>>;

/**
 * Every hand-written note about how a provider ran, in one place so the page
 * and the agent files say the same thing. Numbers never live here; notes that
 * depend on the data are computed from it.
 */

/** "4 vCPU, 8 GB". */
export const formatCompute = (a: Pick<Allocation, "cpu" | "memoryGiB">) => `${a.cpu} vCPU, ${formatGiB(a.memoryGiB)}`;

/** What we measured inside, collapsing the small RAM differences between sandboxes. */
export function measuredText(p: Provider) {
  const m = p.measuredAllocations;
  if (m.length === 0) return null;
  const cpus = [...new Set(m.map((a) => a.cpu))].sort((a, b) => a - b);
  const mem = m.map((a) => a.memoryGiB).sort((a, b) => a - b);
  const lo = mem[0] ?? 0;
  const hi = mem.at(-1) ?? lo;
  const ram = formatGiB(lo) === formatGiB(hi) ? formatGiB(lo) : `${formatGiB(lo)}–${formatGiB(hi)}`;
  return `${cpus.join("–")} vCPU, ${ram}`;
}

/** What we asked the provider for. */
export function requestedText(p: Provider) {
  const r = p.requestedAllocation;
  const size = r.compute ? formatCompute(r.compute) : null;
  const preset = typeof r.size === "string" ? `"${r.size}"` : null;
  const template = r.template ? `template ${r.template}` : null;
  const parts = [size && preset ? `${size} (${preset})` : (size ?? preset), template].filter((x) => x !== null);
  return parts.length > 0 ? parts.join(", ") : "provider default";
}

/** Why a provider in the same-machine track ran something else, beyond what the numbers say. */
const sameSpecWhy: Notes = {
  boxd: "boxd has no 8 GB size at 4 vCPU; this is its nearest.",
};

/** Why a provider is missing from a track. */
export const absentWhy: Record<TrackId, Notes> = {
  default: {},
  "same-spec": {
    superserve: "not in this track: our Superserve plan caps templates at 2 vCPU, so there was no 4 vCPU machine to test. A paid plan may lift this; we will add it if it does.",
  },
};

export const absentNote = (t: Track, id: ProviderId) => absentWhy[t.id][id] ?? "not collected in this track.";

/**
 * The note every chart in a track carries for a provider whose machine is
 * not the track's machine. Empty in the default track, where sizes differ by
 * design and the Machines section says so.
 */
export function allocationNotes(t: Track): Notes {
  if (t.id === "default") return {};
  return Object.fromEntries(
    t.providers.flatMap((p) => {
      if (p.equalSpec) return [];
      const measured = measuredText(p);
      const ran = measured ? `ran ${measured}, not 4 vCPU, 8 GB.` : "machine size not measured, so we can't confirm it matched.";
      return [[p.id, [ran, sameSpecWhy[p.id]].filter(Boolean).join(" ")]];
    }),
  );
}

/** Notes for the default track's machine sizes. */
export const defaultMachineNotes: Notes = {
  e2b: "ran E2B's default base template, 2 vCPU and 512 MB. E2B's pricing page says its default sandbox has 4 GB.",
};

/** Machine notes that apply in a given track. */
export const machineNotes = (t: Track): Notes => (t.id === "default" ? defaultMachineNotes : {});

/** Providers hosted in Europe: every call from Florida crosses the Atlantic. */
export const farNotes: Notes = {
  boat: "runs in France, so every call from our Florida server crosses the Atlantic.",
  boxd: "runs in Germany, so every call from our Florida server crosses the Atlantic.",
};

/**
 * Adapters that need more than one provider call per command, shown on the
 * command and tool replay charts. Empty while every adapter runs a command
 * as one native request; add a provider here if that stops being true.
 */
export const execNotes: Notes = {};

/**
 * Pause that is not a pause: stopping the sandbox ends every process, so an
 * agent can't park work and pick it up. The page shows these as not
 * supported rather than timing them.
 */
export const noRealPause: Notes = {
  daytona: "Daytona's container sandboxes have no pause: stop and start restarts the sandbox and ends every running process.",
  boat: "Boat has no pause: stop and start restarts the machine and ends every running process.",
};

/** The machine probe runs under Python multiprocessing; Superserve's VMs have no /dev/shm for its locks. */
export const probeNote = "not measured: our machine probe needs /dev/shm, which Superserve's VMs don't have";

/** A note as a sentence: one full stop at the end, whatever the note had. */
export const sentence = (note: string) => `${note.trim().replace(/\.$/, "")}.`;

/** Capitalises a note's first letter, unless it starts with a provider's name (boxd stays boxd). */
const opening = (note: string) =>
  Object.values(providerInfo).some((p) => note.startsWith(p.name)) ? note : note.charAt(0).toUpperCase() + note.slice(1);

/**
 * Joins notes for one provider from several maps, in order. Each later note
 * becomes its own capitalised sentence, so "…its nearest." is followed by
 * "Runs in Germany…", never "…its nearest. runs in Germany…".
 */
export function mergeNotes(...maps: readonly Notes[]): Notes {
  const out: Notes = {};
  for (const map of maps)
    for (const [id, note] of Object.entries(map)) {
      if (!note || !isProviderId(id)) continue;
      const before = out[id];
      out[id] = before ? `${sentence(before)} ${sentence(opening(note.trim()))}` : note;
    }
  return out;
}

/**
 * One line for a track that shows both Upstash products, so the two rows read
 * as separate products. The start time is Ephemeral Box's cold-start median in
 * this track; with no result it is left out.
 */
export function upstashTwinNote(t: Track): string | null {
  const has = (id: ProviderId) => t.providers.some((p) => p.id === id);
  if (!has("upstash") || !has("upstash-ephemeral")) return null;
  const cold = t.metric("cold").values.find((v) => v.provider === "upstash-ephemeral");
  const start = cold && cold.n > 0 && cold.p50 !== null ? ` starts in ${formatValue(cold.p50, "s")} but` : "";
  return `Upstash appears twice: Box can pause; Ephemeral Box${start} can't pause.`;
}
