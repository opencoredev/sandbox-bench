import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { MachineSizes } from "@/components/machine-sizes";
import { tracks } from "@/lib/data";
import { sharedDisk, sizeOf } from "@/lib/sizes";

// A sandbox on a shared file system reports the host's disk, which is not an allocation.
describe("shared disks", () => {
  const providers = tracks.default.providers;

  test("a provider on a shared file system has no disk size", () => {
    for (const p of providers.filter((x) => sharedDisk[x.id])) assert.equal(sizeOf(p).diskGiB, null, p.id);
  });

  test("the disk chart leaves it out and says why beside the chart", () => {
    const text = renderToStaticMarkup(<MachineSizes providers={providers} />).replace(/<[^>]+>/g, " ");
    const beam = providers.find((p) => p.id === "beam");

    assert.ok(beam, "Beam has default-track data");
    assert.match(text, /Not in the chart: Beam \(no disk of its own/);
    assert.doesNotMatch(text, /21,4\d\d/);
  });
});
