import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { tracks } from "@/lib/data";
import { eurUsd } from "@/lib/fx";
import { alwaysOn, billedSeconds, defaultInputs, estimate, estimateAll, workloadOf } from "@/lib/pricing/calc";
import type { Estimate, Workload } from "@/lib/pricing/calc";
import { rateCards } from "@/lib/pricing/rates";
import type { RateCard } from "@/lib/pricing/rates";
import type { ProviderId } from "@/lib/providers";

const card = (id: ProviderId): RateCard => rateCards.find((c) => c.id === id) ?? assert.fail(`no rate card for ${id}`);
const priced = (e: Estimate) => (e.kind === "priced" ? e : assert.fail(`${e.id} has no size`));
const close = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b)), `${what}: ${a} vs ${b}`);
const work = (w: Partial<Workload>): Workload => ({ sandboxes: 1, activeMinutes: 60, idleMinutes: 0, cpu: 4, memoryGiB: 8, ...w });

describe("rate cards", () => {
  test("every provider on the site has one, and only once", () => {
    const ids = rateCards.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const p of tracks["same-spec"].providers) assert.ok(ids.includes(p.id), `${p.id} has a rate card`);
  });

  test("4 vCPU, 8 GB for an hour matches the hourly price the benchmark data publishes", () => {
    for (const p of tracks["same-spec"].providers) {
      if (p.commonHourly === null) continue;
      const c = card(p.id);
      const e = priced(estimate(c, work({}), eurUsd.rate));
      // The data's price includes the pinned region the bench ran in (Modal us-east, 1.75x); the calculator prices no region.
      const published = (p.commonHourly / (p.regionMultiplier ?? 1)) * (p.currency === "EUR" ? eurUsd.rate : 1);
      // One sandbox for one hour; the hourly price leaves out a creation fee (Vercel's $0.60 per million).
      close(e.monthlyUsd - c.perSandbox, published, p.id);
    }
  });
});

describe("estimate", () => {
  test("E2B bills the whole size per second: 10,000 five-minute 2 vCPU, 4 GB sandboxes", () => {
    const e = priced(estimate(card("e2b"), workloadOf(defaultInputs), eurUsd.rate));
    close(e.hourlyUsd, 2 * 0.0504 + 4 * 0.0162, "hourly");
    close(e.monthlyUsd, 10_000 * (5 / 60) * (2 * 0.0504 + 4 * 0.0162), "monthly");
    assert.equal(e.atMost, false);
  });

  test("Vercel: CPU on busy time, memory in whole minutes with a one-minute minimum, plus the creation fee", () => {
    const e = priced(estimate(card("vercel"), work({ activeMinutes: 0.5, idleMinutes: 0, cpu: 2, memoryGiB: 4 }), eurUsd.rate));
    close(e.monthlyUsd, 30 * (2 * 0.128) / 3600 + 60 * (4 * 0.0212) / 3600 + 0.6 / 1_000_000, "one short sandbox");
    assert.equal(e.atMost, true);
  });

  test("idle time: billed in full on E2B, memory only on Vercel, not at all on Upstash", () => {
    const busy = work({ activeMinutes: 60, idleMinutes: 0, cpu: 2, memoryGiB: 4 });
    const open = work({ activeMinutes: 60, idleMinutes: 60, cpu: 2, memoryGiB: 4 });
    const extra = (id: ProviderId) => priced(estimate(card(id), open, eurUsd.rate)).monthlyUsd - priced(estimate(card(id), busy, eurUsd.rate)).monthlyUsd;
    close(extra("e2b"), 2 * 0.0504 + 4 * 0.0162, "E2B idle hour");
    close(extra("vercel"), 4 * 0.0212, "Vercel idle hour");
    close(extra("upstash"), 0, "Upstash idle hour");
  });

  test("a provider with fixed sizes prices the smallest that fits, and says when none does", () => {
    const boxd = priced(estimate(card("boxd"), work({ cpu: 2, memoryGiB: 4 }), eurUsd.rate));
    assert.deepEqual(boxd.size, { cpu: 2, memoryGiB: 8 });
    assert.equal(boxd.roundedUp, true);
    close(boxd.hourlyUsd, (2 * 0.039 + 8 * 0.012) * eurUsd.rate, "boxd hourly, converted from euros");
    const baseten = estimate(card("baseten"), work({ cpu: 8, memoryGiB: 16 }), eurUsd.rate);
    assert.deepEqual(baseten, { kind: "no-size", id: "baseten", largest: { cpu: 4, memoryGiB: 8 } });
  });

  test("always on is sandboxes times hours a day for 30 days", () => {
    const w = alwaysOn({ running: 3, hoursPerDay: 24, cpu: 1, memoryGiB: 2 });
    const e = priced(estimate(card("daytona"), w, eurUsd.rate));
    close(e.monthlyUsd, 3 * 24 * 30 * (0.0504 + 2 * 0.0162), "three sandboxes all month");
  });

  test("billing increments round up without float noise", () => {
    assert.equal(billedSeconds({ minimumSeconds: 0, incrementSeconds: 0.001 }, 0.3), 0.3);
    assert.equal(billedSeconds({ minimumSeconds: 60, incrementSeconds: 60 }, 61), 120);
    assert.equal(billedSeconds({ minimumSeconds: 60, incrementSeconds: 60 }, 0), 0);
  });

  test("results come cheapest first, sizes that don't fit last", () => {
    const all = estimateAll(rateCards, work({ cpu: 16, memoryGiB: 32 }), eurUsd.rate);
    const costs = all.flatMap((e) => (e.kind === "priced" ? [e.monthlyUsd] : []));
    assert.deepEqual(costs, [...costs].sort((a, b) => a - b));
    const firstMissing = all.findIndex((e) => e.kind === "no-size");
    assert.ok(firstMissing > 0 && all.slice(firstMissing).every((e) => e.kind === "no-size"));
  });
});
