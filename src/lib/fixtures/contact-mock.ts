import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { ContactPayload } from "@/lib/contact";
import { contactFields } from "@/lib/contact";

/**
 * A stand-in for the console site's /contact endpoint, for tests and local
 * browser checks only (scripts/contact-mock.ts). It follows the same
 * contract: JSON in, 200 on success, 400 with `{ error }` for a bad body, a
 * silent 200 that stores nothing for a filled honeypot, and CORS so a page on
 * another origin can post to it. A company named "force-400" or "force-500"
 * forces that response.
 */

export interface ContactMock {
  url: string;
  /** Submissions it accepted, honeypot ones excluded. */
  received: ContactPayload[];
  /** Honeypot submissions it answered 200 and dropped. */
  dropped: number;
  stop: () => Promise<void>;
}

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { ...cors, "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return parsed;
  } catch {
    return null;
  }
}

function parseBody(body: unknown): ContactPayload | null {
  if (typeof body !== "object" || body === null) return null;
  const out: ContactPayload = { company: "", name: "", email: "", website: "", message: "", hp: "" };
  for (const key of [...contactFields, "hp"] as const) {
    const value: unknown = Reflect.get(body, key);
    if (typeof value !== "string") return null;
    out[key] = value;
  }
  return out;
}

export async function startContactMock(port = 0): Promise<ContactMock> {
  const mock: ContactMock = { url: "", received: [], dropped: 0, stop: async () => {} };
  const server = createServer((req, res) => {
    void (async () => {
      const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
      if (req.method === "OPTIONS") {
        res.writeHead(204, cors);
        res.end();
        return;
      }
      if (pathname === "/__received" && req.method === "GET") return send(res, 200, { received: mock.received, dropped: mock.dropped });
      if (pathname !== "/contact" || req.method !== "POST") return send(res, 404, { error: "not found" });
      const payload = parseBody(await readJson(req));
      if (!payload) return send(res, 400, { error: "Expected company, name, email, website, message and hp as strings." });
      if (payload.hp !== "") {
        mock.dropped += 1;
        return send(res, 200, { ok: true });
      }
      if (payload.company === "force-400") return send(res, 400, { error: "The email address was rejected." });
      if (payload.company === "force-500") return send(res, 500, { error: "boom" });
      if (payload.company.trim() === "" || payload.email.trim() === "" || payload.message.trim() === "") return send(res, 400, { error: "Company, email and message are required." });
      mock.received.push(payload);
      return send(res, 200, { ok: true });
    })();
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("contact mock: no TCP address");
  mock.url = `http://127.0.0.1:${address.port}`;
  mock.stop = () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  return mock;
}
