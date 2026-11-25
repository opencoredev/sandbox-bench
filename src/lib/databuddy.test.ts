import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { databuddyClientId, databuddyOptions } from "@/lib/databuddy";
import { privateCtaLabel, privateCtaLabels } from "@/lib/flags";

// Databuddy loads on the production site only, with aisandboxbench.com's client ID. Run with `bun test`.

describe("databuddy", () => {
  test("the client ID is the aisandboxbench.com website's UUID", () => {
    assert.match(databuddyClientId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.equal(databuddyClientId, "9ba806bf-df8d-4a9c-a97b-b058d3733026");
  });

  test("production loads the tracker, replay and attribute clicks", () => {
    assert.deepEqual(databuddyOptions({ nodeEnv: "production" }), {
      clientId: databuddyClientId,
      disabled: false,
      replay: true,
      autocapture: { webVitals: true, outgoingLinks: true, errors: true, attributes: true },
    });
  });

  test("dev, test and an unset NODE_ENV load nothing", () => {
    for (const nodeEnv of ["development", "test", undefined]) {
      assert.equal(databuddyOptions({ nodeEnv }).disabled, true, `NODE_ENV=${nodeEnv}`);
    }
  });

  test("the private CTA serves the control copy unless the direct variant is served", () => {
    assert.equal(privateCtaLabel("direct"), privateCtaLabels.direct);
    for (const variant of ["control", undefined, "other"]) assert.equal(privateCtaLabel(variant), privateCtaLabels.control);
  });
});
