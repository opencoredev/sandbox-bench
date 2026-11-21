/**
 * The private benchmarks contact form: its fields, the checks the page runs
 * before sending, and the one call it makes. The contract is fixed by the
 * console site's Convex HTTP action:
 *
 *   POST ${NEXT_PUBLIC_CONSOLE_SITE_URL}/contact
 *   content-type: application/json
 *   { company, name, email, website, message, hp }
 *
 * `hp` is a honeypot: a field people never see, so anything in it marks a bot.
 * The page sends it as typed and leaves the decision to the server.
 * Pure apart from `sendContact`, which takes its fetch so tests can run it against a real local server.
 */

export const contactFields = ["company", "name", "email", "website", "message"] as const;
export type ContactField = (typeof contactFields)[number];

/** The body the endpoint takes. `website` is "" when left empty. */
export type ContactPayload = Record<ContactField | "hp", string>;

export type ContactErrors = Partial<Record<ContactField, string>>;

export type Validation = { kind: "valid"; payload: ContactPayload } | { kind: "invalid"; errors: ContactErrors };

export const maxLengths = { company: 200, name: 200, email: 254, website: 300, message: 5000 } as const satisfies Record<ContactField, number>;

const emailShape = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A web address with or without its scheme: "acme.dev" and "https://acme.dev/sandbox" both pass. */
function isWebAddress(value: string) {
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  if (!URL.canParse(withScheme)) return false;
  const { protocol, hostname } = new URL(withScheme);
  return (protocol === "https:" || protocol === "http:") && hostname.includes(".") && !/\s/.test(value);
}

const tooLong = (field: ContactField) => `Keep this under ${maxLengths[field].toLocaleString("en-US")} characters.`;

/** Checks every field at once, so the page can mark all of them in one pass. Values are trimmed. */
export function validateContact(input: ContactPayload): Validation {
  const v: ContactPayload = {
    company: input.company.trim(),
    name: input.name.trim(),
    email: input.email.trim(),
    website: input.website.trim(),
    message: input.message.trim(),
    hp: input.hp,
  };
  const errors: ContactErrors = {};
  if (v.company === "") errors.company = "Enter your company's name.";
  if (v.name === "") errors.name = "Enter your name.";
  if (v.email === "") errors.email = "Enter your work email.";
  else if (!emailShape.test(v.email)) errors.email = "Enter an email address like you@company.com.";
  if (v.website !== "" && !isWebAddress(v.website)) errors.website = "Enter a web address like company.com, or leave it empty.";
  if (v.message === "") errors.message = "Tell us what you'd like measured.";
  for (const field of contactFields) if (!errors[field] && v[field].length > maxLengths[field]) errors[field] = tooLong(field);
  return Object.keys(errors).length > 0 ? { kind: "invalid", errors } : { kind: "valid", payload: v };
}

/**
 * The endpoint for a console site URL, or null when it is unset or not an
 * http(s) URL, in which case the page offers email instead. A trailing slash
 * on the base is dropped, so ".../" and "..." give the same endpoint.
 */
export function contactEndpoint(base: string | undefined): string | null {
  const trimmed = base?.trim() ?? "";
  if (trimmed === "" || !URL.canParse(trimmed)) return null;
  const url = new URL(trimmed);
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}/contact`;
}

/** Where the form posts, read once at build time. */
export const endpoint = contactEndpoint(process.env.NEXT_PUBLIC_CONSOLE_SITE_URL);

/** The address the page offers when it can't send the form itself. */
export const contactEmail = "leodoesdev@gmail.com";
export const mailtoHref = `mailto:${contactEmail}?subject=${encodeURIComponent("Private benchmarks")}`;

export type ContactResult =
  /** Accepted. */
  | { kind: "sent" }
  /** The server refused the fields (400 or 422), with its reason when it gives one. */
  | { kind: "rejected"; reason: string | null }
  /** Any other status, such as a rate limit or a server error. */
  | { kind: "failed"; status: number }
  /** No response: offline, blocked, or timed out. */
  | { kind: "network" };

/** A server's reason from a JSON body like `{ "error": "..." }` or `{ "message": "..." }`, or null. */
function reasonOf(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  for (const key of ["error", "message"]) {
    const value: unknown = Reflect.get(body, key);
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

/** Reads a response into a result. The body is only read for a refusal, where it may say why. */
export async function readResponse(response: Response): Promise<ContactResult> {
  if (response.ok) return { kind: "sent" };
  if (response.status === 400 || response.status === 422) {
    const body: unknown = await response.json().catch(() => null);
    return { kind: "rejected", reason: reasonOf(body) };
  }
  return { kind: "failed", status: response.status };
}

export const sendTimeoutMs = 15_000;

/** Posts the form. Never throws: every outcome, a dropped connection included, is a result. */
export async function sendContact({ url, payload, fetchImpl = fetch, timeoutMs = sendTimeoutMs }: { url: string; payload: ContactPayload; fetchImpl?: typeof fetch; timeoutMs?: number }): Promise<ContactResult> {
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return await readResponse(response);
  } catch {
    return { kind: "network" };
  }
}
