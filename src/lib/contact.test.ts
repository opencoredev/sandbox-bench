import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, test } from "node:test";

import { contactEndpoint, sendContact, validateContact } from "@/lib/contact";
import type { ContactPayload } from "@/lib/contact";
import { startContactMock } from "@/lib/fixtures/contact-mock";
import type { ContactMock } from "@/lib/fixtures/contact-mock";

const filled: ContactPayload = {
  company: "Acme Sandboxes",
  name: "Ada Lovelace",
  email: "ada@acme.dev",
  website: "acme.dev",
  message: "Daily runs from Frankfurt and Virginia, please.",
  hp: "",
};

describe("validateContact", () => {
  test("a filled form is valid and trimmed", () => {
    const v = validateContact({ ...filled, company: "  Acme Sandboxes  ", website: "" });
    assert.deepEqual(v, { kind: "valid", payload: { ...filled, website: "" } });
  });

  test("every missing required field is reported at once; website stays optional", () => {
    const v = validateContact({ company: " ", name: "", email: "", website: "", message: "\n", hp: "" });
    assert.equal(v.kind, "invalid");
    assert.deepEqual(Object.keys(v.kind === "invalid" ? v.errors : {}).sort(), ["company", "email", "message", "name"]);
  });

  test("a malformed email or website is reported", () => {
    const v = validateContact({ ...filled, email: "ada@acme", website: "not a site" });
    assert.ok(v.kind === "invalid" && v.errors.email && v.errors.website);
  });

  test("websites with or without a scheme pass", () => {
    for (const website of ["acme.dev", "https://acme.dev/sandbox", "http://www.acme.co.uk"]) assert.equal(validateContact({ ...filled, website }).kind, "valid", website);
    for (const website of ["acme", "ftp://acme.dev", "javascript:alert(1)"]) assert.equal(validateContact({ ...filled, website }).kind, "invalid", website);
  });

  test("an over-long message is reported", () => {
    const v = validateContact({ ...filled, message: "x".repeat(5001) });
    assert.ok(v.kind === "invalid" && v.errors.message?.includes("5,000"));
  });

  test("the honeypot is passed through untouched, not validated", () => {
    const v = validateContact({ ...filled, hp: "http://spam.example" });
    assert.ok(v.kind === "valid" && v.payload.hp === "http://spam.example");
  });
});

describe("contactEndpoint", () => {
  test("appends /contact, with or without a trailing slash or a path", () => {
    assert.equal(contactEndpoint("https://console.example.com"), "https://console.example.com/contact");
    assert.equal(contactEndpoint("https://console.example.com/"), "https://console.example.com/contact");
    assert.equal(contactEndpoint(" https://x.convex.site/api/ "), "https://x.convex.site/api/contact");
  });

  test("unset, empty or non-http values give null, so the page falls back to email", () => {
    for (const base of [undefined, "", "   ", "console.example.com", "ftp://console.example.com", "javascript:alert(1)"]) assert.equal(contactEndpoint(base), null, String(base));
  });
});

describe("sendContact against a local mock of the endpoint", () => {
  let mock: ContactMock;
  before(async () => {
    mock = await startContactMock();
  });
  after(async () => {
    await mock.stop();
  });

  test("a valid submit is sent as the contract's JSON and accepted", async () => {
    const url = contactEndpoint(mock.url);
    assert.ok(url);
    assert.deepEqual(await sendContact({ url, payload: filled }), { kind: "sent" });
    assert.deepEqual(mock.received.at(-1), filled);
  });

  test("a filled honeypot is answered 200 and dropped by the server", async () => {
    const before = mock.received.length;
    assert.deepEqual(await sendContact({ url: `${mock.url}/contact`, payload: { ...filled, hp: "bot" } }), { kind: "sent" });
    assert.equal(mock.received.length, before);
    assert.equal(mock.dropped, 1);
  });

  test("a 400 is a refusal with the server's reason", async () => {
    assert.deepEqual(await sendContact({ url: `${mock.url}/contact`, payload: { ...filled, company: "force-400" } }), { kind: "rejected", reason: "The email address was rejected." });
  });

  test("a 500 is a failure with its status", async () => {
    assert.deepEqual(await sendContact({ url: `${mock.url}/contact`, payload: { ...filled, company: "force-500" } }), { kind: "failed", status: 500 });
  });

  test("no server at all is a network failure, not a throw", async () => {
    const dead = await startContactMock();
    const url = `${dead.url}/contact`;
    await dead.stop();
    assert.deepEqual(await sendContact({ url, payload: filled }), { kind: "network" });
  });

  test("a server that never answers times out as a network failure", async () => {
    // Accepts the request and never answers.
    const hang = createServer(() => undefined);
    await new Promise<void>((resolve) => hang.listen(0, "127.0.0.1", resolve));
    const address = hang.address();
    assert.ok(address !== null && typeof address !== "string");
    try {
      assert.deepEqual(await sendContact({ url: `http://127.0.0.1:${address.port}/contact`, payload: filled, timeoutMs: 200 }), { kind: "network" });
    } finally {
      hang.closeAllConnections();
      await new Promise<void>((resolve) => hang.close(() => resolve()));
    }
  });
});
