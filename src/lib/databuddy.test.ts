import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { databuddyClientId, databuddyOptions, hasOptedOut } from "@/lib/databuddy";
import { privateCtaLabel, privateCtaLabels } from "@/lib/flags";

// Databuddy loads on the production site only, with aisandboxbench.com's client ID. Run with `bun test`.

describe("databuddy", () => {
  test("the client ID is the aisandboxbench.com website's UUID", () => {
    assert.match(databuddyClientId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.equal(databuddyClientId, "9ba806bf-df8d-4a9c-a97b-b058d3733026");
  });

  test("production loads the tracker, replay and attribute clicks", () => {
    assert.deepEqual(databuddyOptions({ nodeEnv: "production", optedOut: false }), {
      clientId: databuddyClientId,
      disabled: false,
      replay: true,
      autocapture: { webVitals: true, outgoingLinks: true, errors: true, attributes: true },
    });
  });

  test("dev, test and an unset NODE_ENV load nothing", () => {
    for (const nodeEnv of ["development", "test", undefined]) {
      assert.equal(databuddyOptions({ nodeEnv, optedOut: false }).disabled, true, `NODE_ENV=${nodeEnv}`);
    }
  });

  test("an opted-out visitor loads nothing, so no flags request leaves the browser", () => {
    assert.equal(databuddyOptions({ nodeEnv: "production", optedOut: true }).disabled, true);
  });

  test("Do Not Track, Global Privacy Control and Databuddy's stored opt-out each count as opted out", () => {
    const none = () => null;
    const base = { doNotTrack: null, globalPrivacyControl: undefined, stored: none };
    assert.equal(hasOptedOut(base), false);
    assert.equal(hasOptedOut({ ...base, doNotTrack: "0" }), false);
    assert.equal(hasOptedOut({ ...base, doNotTrack: "1" }), true);
    assert.equal(hasOptedOut({ ...base, globalPrivacyControl: true }), true);
    for (const key of ["databuddy_opt_out", "databuddy_disabled"]) {
      assert.equal(hasOptedOut({ ...base, stored: (k) => (k === key ? "true" : null) }), true, key);
    }
  });

  test("the private CTA serves the control copy unless the direct variant is served", () => {
    assert.equal(privateCtaLabel("direct"), privateCtaLabels.direct);
    for (const variant of ["control", undefined, "other"]) assert.equal(privateCtaLabel(variant), privateCtaLabels.control);
  });
});
