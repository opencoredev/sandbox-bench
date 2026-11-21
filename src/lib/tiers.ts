/**
 * Whether the page shows one row per provider or every CPU tier it sells.
 * Kept apart from data.ts so the client switch can name it without the data.
 *
 * globals.css hides every `[data-tier-extra]` row unless <head> holds the
 * element with `tierStyle.id`; tierScript adds it before paint for
 * `?tiers=all`, and the switch adds or removes it. A foreign <head> node,
 * like the track switch's, because React leaves those alone.
 */
export const tierViews = ["one", "all"] as const;
export type TierView = (typeof tierViews)[number];

export const tierParam = "tiers";
/** The value of `?tiers=` that shows every tier. */
export const allTiersValue = "all";

export const tierViewInfo = {
  one: { label: "One per provider", short: "One each" },
  all: { label: "Every CPU tier", short: "Every tier" },
} as const satisfies Record<TierView, { label: string; short: string }>;

export const tierStyle = { id: "tiers-all" } as const;

/** Runs in <head> before the page paints, so a shared `?tiers=all` link never flashes the shorter charts first. */
export const tierScript = `(function(){try{if(new URLSearchParams(location.search).get(${JSON.stringify(tierParam)})===${JSON.stringify(allTiersValue)}){var s=document.createElement("style");s.id=${JSON.stringify(tierStyle.id)};document.head.appendChild(s)}}catch(e){}})()`;
