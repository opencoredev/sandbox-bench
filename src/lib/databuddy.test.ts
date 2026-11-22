import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { databuddyClientId, databuddyScripts, databuddyScriptTags } from "@/lib/databuddy";

// Databuddy loads on the production site only, with aisandboxbench.com's client ID, as on cicdbench.com. Run with `bun test`.

describe("databuddy", () => {
  test("the client ID is the aisandboxbench.com website's UUID", () => {
    assert.match(databuddyClientId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.equal(databuddyClientId, "9ba806bf-df8d-4a9c-a97b-b058d3733026");
  });

  test("production loads the tracker and session replay with the matching settings", () => {
    assert.deepEqual(databuddyScripts({ nodeEnv: "production" }), [
      {
        src: "https://cdn.databuddy.cc/databuddy.js",
        "data-client-id": databuddyClientId,
        "data-track-web-vitals": "true",
        "data-track-outgoing-links": "true",
        "data-track-errors": "true",
        crossOrigin: "anonymous",
        async: true,
      },
      {
        src: "https://cdn.databuddy.cc/replay.js",
        "data-client-id": databuddyClientId,
        crossOrigin: "anonymous",
        async: true,
      },
    ]);
    assert.equal(databuddyScripts({ nodeEnv: "production" }), databuddyScriptTags);
  });

  test("dev, test and an unset NODE_ENV load nothing", () => {
    for (const nodeEnv of ["development", "test", undefined]) {
      assert.deepEqual(databuddyScripts({ nodeEnv }), [], `NODE_ENV=${nodeEnv}`);
    }
  });
});
