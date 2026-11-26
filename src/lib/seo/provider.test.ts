import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { agentData, agentMarkdown, allocationVerificationExport, llmsTxt } from "@/lib/agent-data";
import { trackIds, tracks } from "@/lib/data";
import { formatValue, ordinal } from "@/lib/format";
import { hardware, locationLabel } from "@/lib/hardware";
import { providerPageOf } from "@/lib/provider-pages";
import { isExtraTier, providerName } from "@/lib/providers";
import { headlineRows, runTrackOf } from "@/lib/realistic";
import { realistic } from "@/lib/realistic-data";
import { rankScores } from "@/lib/score";
import { trackScores } from "@/lib/score-categories";
import { advertisedCapacityText, measuredDiskText } from "@/lib/sizes";
import { isProviderPage, providerPages, providerPath } from "@/lib/seo/pages";
import { faqJsonLd, fieldText, highlights, providerFaqs, providerNotes, providerResults, providerSummary, realTaskCost, realTaskTime, rivalsText, scorecard, verdict } from "@/lib/seo/provider";

// Provider pages quote the site's own notes, so a note must reach the right provider and no other. Run with `bun test`.

describe("providerNotes", () => {
  test("Upstash Box gets the notes about its product family, Ephemeral Box included", () => {
    const notes = providerNotes("upstash");
    assert.ok(notes.some((n) => n.startsWith("Upstash appears twice")));
    assert.ok(notes.some((n) => n.startsWith("Ephemeral Box has no pause")));
  });

  test("a provider named mid-sentence gets that sentence", () => {
    assert.ok(providerNotes("superserve").some((n) => n.includes("Superserve now runs")));
  });

  test("notes about other providers stay off a page", () => {
    for (const n of providerNotes("e2b")) assert.ok(n.includes("E2B"));
    assert.ok(!providerNotes("daytona").some((n) => n.includes("Upstash")));
  });
});

describe("real-task placings", () => {
  test("time ranks follow the chart's order, fastest first", () => {
    const rows = headlineRows(realistic, runTrackOf["same-spec"], "fix-and-test");
    // Ranked among providers on their first CPU tier, as on the page.
    const timed = [...rows.costed, ...rows.uncosted].filter((r) => r.medianWallS !== null && !isExtraTier(r.provider)).sort((a, b) => (a.medianWallS ?? 0) - (b.medianWallS ?? 0));
    assert.ok(timed.length > 1);
    const first = realTaskTime("same-spec", timed[0]!.provider, "fix-and-test");
    const last = realTaskTime("same-spec", timed[timed.length - 1]!.provider, "fix-and-test");
    assert.equal(first.kind === "ranked" && first.rank, 1);
    assert.ok(last.kind === "ranked" && last.of === timed.length && last.rank > 1);
  });

  test("cost ranks follow the cost chart, cheapest first", () => {
    const costed = headlineRows(realistic, runTrackOf["same-spec"], "fix-and-test").costed.filter((r) => !isExtraTier(r.provider));
    costed.forEach((r, i) => {
      const c = realTaskCost("same-spec", r.provider, "fix-and-test");
      assert.ok(c.kind === "ranked" && c.rank === i + 1 && c.of === costed.length);
    });
  });

  test("a provider with no run says why instead of ranking", () => {
    // Beam's 128 MiB default machine is too small for the real tasks.
    const t = realTaskTime("default", "beam", "fix-and-test");
    assert.equal(t.kind, "blank");
  });
});

describe("standings print what the home page's charts print", () => {
  test("a median is formatted from the unrounded value, not the published 3-decimal one", () => {
    // Daytona's same-machine cold start is 1.24996 s: rounded to 1.250 first it would print 1.3 s.
    for (const tid of trackIds)
      for (const id of providerPages) {
        const raw = tracks[tid].findMetric("cold")?.values.find((v) => v.provider === id)?.p50;
        const row = providerResults(id).tracks.find((t) => t.id === tid)?.groups.flatMap((g) => g.rows).find((r) => r.id === "cold");
        if (raw == null || row?.standing.kind !== "ranked") continue;
        assert.equal(row.standing.median, formatValue(raw, "s"), `${id} on ${tid}`);
      }
  });
});

const bad = /undefined|NaN|null|\[object Object\]/;

describe("scorecard", () => {
  test("every provider's cells are the home page's own cells", () => {
    for (const tid of trackIds) {
      const home = trackScores(tracks[tid]);
      for (const id of providerPages) {
        const card = scorecard(tid, id);
        assert.deepEqual(
          card.map((e) => e.category.id),
          home.map((c) => c.category.id),
        );
        card.forEach((e, i) => {
          const cell = home[i]?.scores.find((s) => s.provider === id) ?? { kind: "not-measured", provider: id };
          assert.deepEqual(e.cell, cell, `${id} ${e.category.id} on ${tid}`);
        });
      }
    }
  });

  test("ranks count the providers ahead, so the best is 1st and every rank sits inside the field", () => {
    for (const tid of trackIds)
      for (const category of trackScores(tracks[tid])) {
        const ranks = providerPages.flatMap((id) => {
          const e = scorecard(tid, id).find((x) => x.category.id === category.category.id);
          return e?.rank ? [e.rank] : [];
        });
        for (const r of ranks) assert.ok(r.rank >= 1 && r.rank <= r.of, `${category.category.id} on ${tid}`);
        const measured = category.scores.filter((s) => s.kind === "scored" || s.kind === "valued");
        const best = rankScores(measured, category.category.better)[0];
        if (best && isProviderPage(best.provider)) assert.equal(scorecard(tid, best.provider).find((x) => x.category.id === category.category.id)?.rank?.rank, 1);
      }
  });

  test("a provider with no reading has no rank", () => {
    // Beam's 128 MiB default machine is too small for the real tasks.
    const e = scorecard("default", "beam").find((x) => x.category.id === "real-tasks");
    assert.equal(e?.cell.kind, "not-measured");
    assert.equal(e?.rank, null);
  });
});

describe("highlights", () => {
  test("leads come from the top third and trails from the bottom third, never both, best and worst first", () => {
    for (const id of providerPages)
      for (const t of providerResults(id).tracks) {
        const { leads, trails } = highlights(t, id);
        assert.ok(leads.length <= 3 && trails.length <= 3);
        for (const p of leads) assert.ok(p.rank.rank <= Math.ceil(p.rank.of / 3), `${id} ${p.label}`);
        for (const p of trails) assert.ok(p.rank.rank > p.rank.of - Math.ceil(p.rank.of / 3), `${id} ${p.label}`);
        const lead = new Set(leads.map((p) => p.id));
        assert.ok(!trails.some((p) => lead.has(p.id)), id);
        const depth = (p: (typeof leads)[number]) => (p.rank.rank - 1) / (p.rank.of - 1);
        leads.forEach((p, i) => {
          const prev = leads[i - 1];
          if (prev) assert.ok(depth(prev) <= depth(p));
        });
        trails.forEach((p, i) => {
          const prev = trails[i - 1];
          if (prev) assert.ok(depth(prev) >= depth(p));
        });
      }
  });

  test("every highlight quotes a result the page shows, with the same value and rank", () => {
    for (const id of providerPages)
      for (const t of providerResults(id).tracks) {
        const rows = t.groups.flatMap((g) => g.rows);
        const card = scorecard(t.id, id);
        const { leads, trails } = highlights(t, id);
        for (const p of [...leads, ...trails]) {
          assert.ok(!bad.test(`${p.label} ${p.value}`), `${id} ${p.label}`);
          const row = rows.find((r) => r.id === p.id);
          if (row) {
            assert.ok(row.standing.kind === "ranked");
            assert.equal(p.value, row.standing.median);
            assert.equal(p.rank.rank, row.standing.rank);
            continue;
          }
          const from = { "fix-and-test": "real-tasks", "fix-and-test-cost": "cost" }[p.id];
          if (from) {
            const e = card.find((x) => x.category.id === from);
            assert.ok(e && (e.cell.kind === "scored" || e.cell.kind === "valued"));
            assert.equal(p.value, e.cell.display);
            assert.deepEqual(p.rank, e.rank);
            continue;
          }
          assert.equal(p.id, "build");
          const b = realTaskTime(t.id, id, "build");
          assert.ok(b.kind === "ranked" && b.value === p.value && b.rank === p.rank.rank);
        }
      }
  });
});

describe("page copy", () => {
  test("every provider's summary and verdicts are whole sentences with no missing values", () => {
    for (const id of providerPages) {
      const s = providerSummary(id);
      assert.ok(s.startsWith(providerName(id)) && !bad.test(s), s);
      for (const t of providerResults(id).tracks) {
        const v = verdict(t, id);
        assert.ok(v.endsWith(".") && !bad.test(v), v);
        const speed = scorecard(t.id, id).find((e) => e.category.id === "speed");
        if (speed?.cell.kind === "scored") assert.ok(v.includes(speed.cell.display), v);
      }
    }
  });

  test("the summary quotes the real task's time and cost where the provider has them", () => {
    const card = scorecard("same-spec", "freestyle");
    const task = card.find((e) => e.category.id === "real-tasks")?.cell;
    const cost = card.find((e) => e.category.id === "cost")?.cell;
    assert.ok(task?.kind === "scored" && cost?.kind === "valued");
    const s = providerSummary("freestyle");
    assert.ok(s.includes(task.display) && s.includes(cost.display), s);
  });
});

describe("FAQ", () => {
  test("every provider page gets five answered questions with no missing values", () => {
    for (const id of providerPages) {
      const faqs = providerFaqs(id);
      assert.equal(faqs.length, 5, id);
      for (const f of faqs) {
        assert.ok(f.question.includes(providerName(id)) && f.question.endsWith("?"), f.question);
        assert.ok(f.answer.length > 40 && /[.)]$/.test(f.answer), `${id}: ${f.answer}`);
        assert.ok(!bad.test(f.answer), `${id}: ${f.answer}`);
      }
    }
  });

  test("answers quote the page's own numbers", () => {
    const [cold, cost, pause, hardware, reliability] = providerFaqs("freestyle");
    const t = providerResults("freestyle").tracks.find((x) => x.id === "same-spec");
    assert.ok(t);
    const row = t.groups.flatMap((g) => g.rows).find((r) => r.id === "cold");
    assert.ok(row?.standing.kind === "ranked");
    assert.ok(cold?.answer.includes(`${row.standing.median} (p95 ${row.standing.p95})`));
    const e = scorecard("same-spec", "freestyle").find((x) => x.category.id === "cost");
    assert.ok(e?.cell.kind === "valued" && e.rank);
    assert.ok(cost?.answer.includes(`${e.cell.display} per 1,000 completed, ${ordinal(e.rank.rank)} cheapest of ${e.rank.of}`), cost?.answer);
    assert.ok(pause?.answer.includes("pause ") && pause.answer.includes("resume "));
    assert.ok(hardware?.answer.includes("Firecracker"));
    assert.ok(reliability?.answer.includes(t.reliability.succeeded.toLocaleString("en-US")));
  });

  test("boxd's cost on Same machine: ranked with all 19 like the home page's Cost column, with why it can't be the cheapest pick", () => {
    const e = scorecard("same-spec", "boxd").find((x) => x.category.id === "cost");
    assert.ok(e?.cell.kind === "valued" && e.rank, `boxd's cost is ${e?.cell.kind ?? "missing"}`);
    assert.equal(e.cell.display, "$5.50");
    assert.deepEqual(e.rank, { rank: 5, of: tracks["same-spec"].providers.filter((p) => !isExtraTier(p.id)).length });
    const cost = providerFaqs("boxd")[1];
    assert.ok(cost?.answer.includes("$5.50 per 1,000 completed, 5th cheapest of 19, though it can't be the cheapest pick (it ran with 15.6 GiB"), cost?.answer);
    const chart = realTaskCost("same-spec", "boxd", "fix-and-test");
    assert.ok(chart.kind === "ranked" && chart.value === "$5.50" && chart.rank === 5 && chart.of === 19);
  });

  test("every provider's cost rank on each track counts the same field as the home page's Cost column", () => {
    for (const tid of trackIds) {
      const { costed } = headlineRows(realistic, runTrackOf[tid], "fix-and-test");
      const field = costed.filter((r) => r.incomplete <= 1 && !isExtraTier(r.provider)).length;
      for (const id of providerPages) {
        const e = scorecard(tid, id).find((x) => x.category.id === "cost");
        if (e?.rank) assert.equal(e.rank.of, field, `${tid} ${id}`);
      }
    }
  });

  test("a provider with no pause says so in its own words, name capitalised", () => {
    const pause = providerFaqs("boat")[2];
    assert.ok(pause?.answer.includes("Boat has no pause"), pause?.answer);
  });

  test("a 100% success rate distinguishes separate errors recorded outside counted attempts", () => {
    const luxor = providerFaqs("tenki")[4];
    assert.ok(luxor);
    assert.ok(luxor.answer.includes("100.00%"), luxor.answer);
    assert.ok(luxor.answer.includes("outside those attempts"), luxor.answer);
    assert.ok(!luxor.answer.includes("failures counted against it"), luxor.answer);
  });

  test("FAQPage JSON-LD mirrors the questions and serialises cleanly", () => {
    for (const id of providerPages) {
      const faqs = providerFaqs(id);
      const ld = faqJsonLd(faqs);
      assert.equal(ld["@type"], "FAQPage");
      assert.equal(ld.mainEntity.length, faqs.length);
      ld.mainEntity.forEach((q, i) => {
        assert.equal(q["@type"], "Question");
        assert.equal(q.name, faqs[i]?.question);
        assert.equal(q.acceptedAnswer["@type"], "Answer");
        assert.equal(q.acceptedAnswer.text, faqs[i]?.answer);
      });
      const json = JSON.stringify(ld);
      assert.ok(!bad.test(json), id);
      assert.deepEqual(JSON.parse(json), ld);
    }
  });
});

describe("provider page links", () => {
  test("the light module agrees with the SEO page list", () => {
    for (const id of providerPages) assert.equal(providerPageOf(id), providerPath(id));
    assert.equal(providerPageOf("vercel"), null);
  });

  test("both Microsandbox CPU tiers export outbound IP location, never a hosting location", () => {
    const rows = trackIds.flatMap((id) => agentData().tracks[id].providers.filter((p) => p.id === "microsandbox" || p.id === "microsandbox-shared"));
    assert.deepEqual(rows.map((p) => p.id).sort(), ["microsandbox", "microsandbox", "microsandbox-shared"]);
    for (const p of rows) {
      assert.equal(p.ranIn, null, p.id);
      assert.equal(p.outboundIpLocation, "Falkenstein, DE", p.id);
    }
  });

  test("egress-only providers report outbound IP location rather than proven hosting location", () => {
    const m = providerResults("maritime");
    for (const t of m.tracks) {
      assert.equal(t.ranIn, null);
      assert.equal(t.outboundIpLocation, "Falkenstein, DE");
    }
    assert.ok(hardware.maritime);
    assert.equal(locationLabel(hardware.maritime, "Runs in"), "Outbound IP in Germany");
    assert.equal(locationLabel(hardware.maritime, "Sandbox in"), "Outbound IP in Germany");
    const faqs = providerFaqs("maritime");
    for (const q of faqs) assert.ok(!/Hosted on Hetzner/i.test(q.answer), q.answer);
    const b = providerResults("buddy");
    assert.equal(b.tracks.length, 2);
    for (const t of b.tracks) {
      assert.equal(t.ranIn, null);
      assert.equal(t.outboundIpLocation, "New York City, US");
    }
    assert.ok(hardware.buddy);
    assert.equal(locationLabel(hardware.buddy, "Runs in"), "Outbound IP in New York");
    for (const q of providerFaqs("buddy")) assert.ok(!/Hosted on Hivelocity/i.test(q.answer), q.answer);
  });

  test("Buddy's hardware entry matches its 260 fingerprints, 130 on each machine", () => {
    for (const id of trackIds) {
      const p = tracks[id].providers.find((x) => x.id === "buddy");
      assert.ok(p?.hardware, `no Buddy fingerprints on ${id}`);
      assert.equal(p.hardware.cpuModels.reduce((n, m) => n + m.count, 0), 130);
      assert.deepEqual(p.hardware.cpuModels, [{ value: "AMD EPYC 9645 96-Core Processor", count: 130 }]);
      assert.deepEqual(p.hardware.location, [{ value: "New York City, US", count: 130 }]);
    }
    assert.match(hardware.buddy?.region ?? "", /all 260 sandboxes fingerprinted/);
  });
});

describe("Buddy's provider page", () => {
  test("a provider marked machine differs never reads as the same 4 vCPU, 8 GiB machine", () => {
    for (const id of ["buddy", "boxd"] as const) {
      const r = providerResults(id);
      const same = r.tracks.find((t) => t.id === "same-spec");
      assert.ok(same && !same.machine.equalSpec, `${id} is marked machine differs`);
      const texts = [providerSummary(id), verdict(same, id), ...providerFaqs(id).map((f) => f.answer), JSON.stringify(faqJsonLd(providerFaqs(id)))];
      for (const t of texts) assert.doesNotMatch(t, /the same 4 vCPU, 8 Gi?B machine/, `${id}: ${t}`);
      assert.match(verdict(same, id), /^On its nearest size to 4 vCPU, 8 GiB \(4 vCPU, [\d.]+ Gi?B measured inside, so the machine differs\)/);
    }
    assert.match(providerSummary("buddy"), /^Buddy sandbox on its nearest size to 4 vCPU, 8 GiB \(4 vCPU, 7\.45 GiB measured inside, so the machine differs\)/);
    // An equal-size provider keeps the plain wording.
    assert.match(providerSummary("maritime"), /^Maritime sandbox on the same 4 vCPU, 8 GiB machine:/);
    // The machine note describes the 4x8 size Buddy actually sells.
    const note = providerResults("buddy").tracks.find((t) => t.id === "same-spec")?.machine.note ?? "";
    assert.match(note, /^ran 4 vCPU, 7\.45 GiB, not 4 vCPU, 8 GiB\. Buddy sells memory in decimal GB: its 4x8 size is 4 vCPU and 8 GB \(8,000,000,000 bytes\), which is 7\.45 GiB/);
  });

  test("the reliability answer and its JSON-LD say the counts are the published runs, and name the replaced ones", () => {
    const faq = providerFaqs("buddy").find((f) => f.question === "How reliable is Buddy?");
    assert.ok(faq);
    const a = faq.answer;
    assert.doesNotMatch(a, /1,076 of 1,076 attempts succeeded/, "the figure is qualified");
    assert.equal((a.match(/1,076 of 1,076 attempts in the published runs succeeded \(100\.00%\)/g) ?? []).length, 2);
    // Default machine: the first bursts, one HTTP 429 and 9 ownership-verification failures.
    assert.match(a, /its first bursts \(Nov 25, 01:32 UTC\), where 10 creates in its bursts of 10 failed: Buddy answered one status check with HTTP 429.*9 failed with a provider request error, their sandboxes' ownership unverified; rerun at 02:01 UTC/);
    // Same machine: the main run's 429 at create 98 plus 3 DNS failures on one preview, and the wrong-size snapshot run before 5afd423.
    assert.match(a, /its first main run of 100 \(Nov 25\), where Buddy answered a status check \(GET \/sandboxes\/\{id\}\) on its 98th create with HTTP 429, and one preview's new hostname didn't resolve yet \(3 DNS lookup failures on its retries\)/);
    assert.match(a, /its first snapshot run \(Nov 25\), where our harness restored 6 snapshots at Buddy's default 2x4 size instead of 4x8, since fixed in harness commit 5afd423/);
    const ld = JSON.stringify(faqJsonLd(providerFaqs("buddy")));
    assert.ok(ld.includes(JSON.stringify(a).slice(1, -1)), "the JSON-LD answer is the page's answer");
    // A provider with no replaced run keeps the plain count.
    const boxd = providerFaqs("boxd").find((f) => f.question === "How reliable is boxd?")?.answer ?? "";
    assert.doesNotMatch(boxd, /published runs|Not in these counts/);
    // Maritime's replaced 429 runs are named beside its counts too, its recorded failures unchanged.
    const maritime = providerFaqs("maritime").find((f) => f.question === "How reliable is Maritime?")?.answer ?? "";
    assert.match(maritime, /Not in these counts, because we replaced the runs.*refused its first 27 creates with HTTP 429/);
    assert.match(maritime, /with failures recorded: Maritime POST \/sandboxes\/\{id\}\/pause failed/);
  });

  test("ranks count products, apart from providers, as the home page does (Upstash sells two products)", () => {
    const r = providerResults("buddy");
    for (const t of r.tracks) {
      const products = tracks[t.id].providers.filter((p) => !isExtraTier(p.id)).length;
      assert.deepEqual(t.field, { providers: products - 1, products });
      assert.equal(fieldText(t.field), `${products - 1} providers, ${products} products`);
      assert.equal(rivalsText(t.field), `${products - 1} other sandbox products (${products - 1} providers in all)`);
    }
    const cold = providerFaqs("buddy").find((f) => f.question === "How fast is Buddy's cold start?")?.answer ?? "";
    assert.match(cold, /18th of 19 products\./);
    assert.doesNotMatch(cold, /of \d+ providers/);
  });

  test("Buddy default allocation exports and disk chart helpers keep decimal GB and binary GiB distinct", () => {
    const data = agentData();
    assert.match(data.about, /4 vCPU, 8 GiB machine \(nearest size where a provider has no exact match/);
    assert.match(data.about, /every failure in the published runs counted unless we classified that attempt as ours or a test's own policy excludes it, one whose cause is unconfirmed included.*replaced earlier runs disclosed/);
    assert.match(data.whatATaskCosts.howToRead, /on the same-machine track, 4 vCPU and 8 GiB/);
    const defBuddy = data.tracks.default.providers.find((p) => p.id === "buddy");
    assert.ok(defBuddy);
    const req = defBuddy.allocation.requested;
    assert.ok("provisioned" in req && req.provisioned !== null);
    assert.equal(req.provisioned.memoryGB, 4);
    assert.equal(req.provisioned.memoryGiB, 3.725);
    assert.equal("diskGB" in req.provisioned ? req.provisioned.diskGB : undefined, 50);
    assert.equal(req.provisioned.diskGiB, 46.566);
    assert.equal(defBuddy.allocation.verified, true);
    assert.deepEqual(defBuddy.allocation.mismatches, []);
    const sameBuddy = data.tracks["same-spec"].providers.find((p) => p.id === "buddy");
    assert.ok(sameBuddy);
    assert.equal(sameBuddy.allocation.requested.text, "4 vCPU, 8 GiB");
    assert.equal(sameBuddy.allocation.equalSpec, false);
    assert.equal(sameBuddy.allocation.verified, false);
    assert.match(llmsTxt(), /on the same-machine track only a provider that measured 4 vCPU and 8 GiB counts\./);
    assert.match(llmsTxt(), /Same machine: 4 vCPU, 8 GiB\. Every provider asked for Boat's machine, 4 vCPU and 8 GiB/);
    assert.equal(data.commonSize, "4 vCPU, 8 GiB");
    assert.ok(data.comingNextUpdate.includes("The same-machine (4 vCPU, 8 GiB) track"));
    assert.match(data.whatATaskCosts.about, /same-machine track \(4 vCPU, 8 GiB\)/);
    assert.match(agentMarkdown(), /on a 4 vCPU, 8 GiB reference machine/);
    // Independent harness mismatch reasons and over-provisioned RAM are preserved when re-evaluating decimal-GB memory.
    const rawDefBuddy = tracks.default.providers.find((p) => p.id === "buddy");
    assert.ok(rawDefBuddy);
    for (const reason of ["Restored allocation differs from source", "Multiple requested allocations"]) {
      const res = allocationVerificationExport({
        ...rawDefBuddy,
        allocationVerification: { verified: false, mismatches: [...rawDefBuddy.allocationVerification.mismatches, reason] },
      });
      assert.equal(res.verified, false);
      assert.deepEqual(res.mismatches, [reason]);
    }
    const overMem = allocationVerificationExport({
      ...rawDefBuddy,
      measuredAllocations: [{ cpu: 2, memoryGiB: 3.73, diskGiB: 45.5 }],
    });
    assert.equal(overMem.verified, false);
    assert.equal(overMem.mismatches.length, 1);
    assert.equal(advertisedCapacityText("buddy", "diskGiB", 46.6), "50 GB (46.6 GiB)");
    assert.equal(measuredDiskText("buddy", 45.534), "45.5 GiB");
    assert.equal(advertisedCapacityText("maritime", "diskGiB", 12), "12 GB");
  });

  test("results.json and results.md carry Buddy's replaced runs beside its published reliability", () => {
    const data = agentData();
    const defBuddy = data.tracks.default.providers.find((p) => p.id === "buddy");
    const sameBuddy = data.tracks["same-spec"].providers.find((p) => p.id === "buddy");
    assert.ok(defBuddy && sameBuddy);
    assert.equal(defBuddy.replacedRuns.length, 1);
    assert.match(defBuddy.replacedRuns[0]?.run ?? "", /first bursts \(Nov 25, 01:32 UTC\)/);
    assert.equal(sameBuddy.replacedRuns.length, 2);
    assert.match(sameBuddy.replacedRuns[0]?.failed ?? "", /GET \/sandboxes\/\{id\}/);
    assert.match(sameBuddy.replacedRuns[1]?.failed ?? "", /5afd423/);
    const md = agentMarkdown();
    assert.match(md, /- Buddy: no failures counted against the provider\. Not in these counts, because we replaced the run/);
    assert.match(md, /- Buddy: no failures counted against the provider\. Not in these counts, because we replaced the runs/);
    assert.match(md, /- Buddy: its first bursts \(Nov 25, 01:32 UTC\), where/);
    assert.match(md, /- Buddy: its first main run of 100 \(Nov 25\), where Buddy answered a status check/);
    assert.match(md, /- Buddy: its first snapshot run \(Nov 25\), where our harness restored 6 snapshots/);
  });
});
