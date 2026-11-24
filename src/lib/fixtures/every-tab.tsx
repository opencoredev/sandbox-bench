import { Fragment } from "react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Tab } from "@/components/tabs";

/**
 * A tabbed card's HTML as a visitor ends up seeing it after opening every
 * tab: the card as the server renders it (its tab list and first tab), then
 * each later tab's content, which the browser builds when that tab opens.
 */
export function everyTab(card: ReactNode, tabs: readonly Tab[]): string {
  const first = tabs.find((t) => "content" in t)?.id;
  const later = tabs.flatMap((t) => ("content" in t && t.id !== first ? [<Fragment key={t.id}>{t.content}</Fragment>] : []));
  return renderToStaticMarkup(
    <>
      {card}
      {later}
    </>,
  );
}
