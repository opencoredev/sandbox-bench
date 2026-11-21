import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { RealTasks, taskTimes } from "@/components/real-tasks";
import { tracks } from "@/lib/data";
import { isExtraTier } from "@/lib/providers";
import { profileIds } from "@/lib/realistic";

// The real-task charts time every provider on the page (each on its first CPU tier), or say why one has no time.
describe("real tasks", () => {
  for (const track of Object.values(tracks))
    for (const profile of profileIds)
      test(`${track.id} ${profile}: every provider is timed or has a reason, fastest first`, () => {
        const { timed, missing } = taskTimes(track, profile);
        const ids = [...timed.map((r) => r.provider), ...missing.map((m) => m.id)];

        // A CPU tier past a provider's first is compared in the tier table; its gaps here are by design.
        for (const p of track.providers.filter((x) => !isExtraTier(x.id))) assert.ok(ids.includes(p.id), `${p.id} missing from ${track.id} ${profile}`);
        assert.equal(new Set(ids).size, ids.length, "no provider listed twice");
        for (const m of missing) assert.ok(m.why.length > 0, m.id);
        const times = timed.map((r) => r.medianWallS);
        assert.deepEqual(times, [...times].sort((a, b) => a - b));
      });

  test("the section names who has no result under the chart", () => {
    // On default machines several are too small for the tasks; on the same machine everyone ran.
    const text = renderToStaticMarkup(<RealTasks track={tracks.default} />).replace(/<[^>]+>/g, " ");

    assert.match(text, /time to finish/);
    assert.match(text, /No result for/);
  });
});
