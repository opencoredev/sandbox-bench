import type { ProviderId } from "@/lib/providers";

/**
 * The error our Archil adapter reported on SDK 1.3.0 when Archil closed a
 * process connection before the exit came through. Fixed in SDK 1.3.1.
 */
const archilAdapterBugReason = "Process termination could not be confirmed. (outcome_unknown)";

/** Said beside Archil's counted failure of that text, lower case so it reads inside a list item's parentheses. */
export const archilUnconfirmedCause =
  "cause unconfirmed: the same error came from a bug in our SDK's Archil adapter, fixed in SDK 1.3.1, so this failure may be ours";

/**
 * A caveat on a counted failure, or null. Only Archil's failures with the
 * adapter bug's text carry one: they stay counted, since the evidence can't
 * tell the bug from a real Archil failure. Every other failure has none, so
 * it renders and exports as before.
 */
export function failureNote({ provider, reason }: { provider: ProviderId; reason: string }): string | null {
  return provider === "archil" && reason === archilAdapterBugReason ? archilUnconfirmedCause : null;
}

/** The note as a sentence on its own: "Cause unconfirmed: …, so this failure may be ours." */
export const noteSentence = (note: string) => `${note.charAt(0).toUpperCase()}${note.slice(1)}.`;
