import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { trackIds, tracks } from "@/lib/data";
import { formatValue, ordinal } from "@/lib/format";
import { hardware, locationLabel } from "@/lib/hardware";
import { providerPageOf } from "@/lib/provider-pages";
import { isExtraTier, providerName } from "@/lib/providers";
import { headlineRows, runTrackOf } from "@/lib/realistic";
import { realistic } from "@/lib/realistic-data";
import { rankScores } from "@/lib/score";
import { trackScores } from "@/lib/score-categories";
import { isProviderPage, providerPages, providerPath } from "@/lib/seo/pages";
import { faqJsonLd, highlights, providerFaqs, providerNotes, providerResults, providerSummary, realTaskCost, realTaskTime, scorecard, verdict } from "@/lib/seo/provider";

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

  test("boxd's cost on Same machine: ranked with all 17 like the home page's Cost column, with why it can't be the cheapest pick", () => {
    const e = scorecard("same-spec", "boxd").find((x) => x.category.id === "cost");
    assert.ok(e?.cell.kind === "valued" && e.rank, `boxd's cost is ${e?.cell.kind ?? "missing"}`);
    assert.equal(e.cell.display, "$5.50");
    assert.deepEqual(e.rank, { rank: 5, of: tracks["same-spec"].providers.filter((p) => !isExtraTier(p.id)).length });
    const cost = providerFaqs("boxd")[1];
    assert.ok(cost?.answer.includes("$5.50 per 1,000 completed, 5th cheapest of 17, though it can't be the cheapest pick (it ran with 15.6 GiB"), cost?.answer);
    const chart = realTaskCost("same-spec", "boxd", "fix-and-test");
    assert.ok(chart.kind === "ranked" && chart.value === "$5.50" && chart.rank === 5 && chart.of === 17);
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
  });
});
