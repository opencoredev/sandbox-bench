import { JsonLd } from "@/components/seo/json-ld";
import { agentData } from "@/lib/agent-data";
import { trackIds, tracks } from "@/lib/data";
import { dataDate, site } from "@/lib/seo/pages";

const name = "Sandbox bench";
const publisher = { "@type": "Organization", "@id": `${site}/#organization`, name: "opencoredev", url: "https://github.com/opencoredev" } as const;

/** Every metric the published model carries, once, in its order on the first track that has it. */
function measured() {
  const seen = new Map<string, { "@type": "PropertyValue"; name: string; unitText: string }>();
  for (const id of trackIds) {
    for (const m of agentData().tracks[id].metrics) {
      if (!seen.has(m.id)) seen.set(m.id, { "@type": "PropertyValue", name: m.label, unitText: m.unit });
    }
  }
  return [...seen.values()];
}

/** The earliest start and latest end across both tracks' run windows, as an ISO 8601 interval. */
function coverage() {
  const windows = trackIds.map((id) => tracks[id].window);
  const start = windows.map((w) => w.start).reduce((a, b) => (Date.parse(b) < Date.parse(a) ? b : a));
  const end = windows.map((w) => w.end).reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a));
  return `${start.slice(0, 10)}/${end.slice(0, 10)}`;
}

/**
 * Structured data for the homepage: the site, who publishes it, and the
 * results as a Dataset with its two downloads. Every field comes from the
 * published model, so a data refresh updates it.
 */
export function HomeJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": `${site}/#website`, url: `${site}/`, name, publisher: { "@id": publisher["@id"] } },
      publisher,
      {
        "@type": "Dataset",
        "@id": `${site}/#dataset`,
        name: `${name} results`,
        description: agentData().about,
        url: `${site}/`,
        isAccessibleForFree: true,
        license: "https://opensource.org/licenses/MIT",
        dateModified: dataDate,
        temporalCoverage: coverage(),
        creator: { "@type": "Person", name: "Leo", alternateName: "@leodev", url: "https://leodev.cv" },
        publisher: { "@id": publisher["@id"] },
        variableMeasured: measured(),
        distribution: [
          { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: `${site}/results.json` },
          { "@type": "DataDownload", encodingFormat: "text/markdown", contentUrl: `${site}/results.md` },
        ],
      },
    ],
  };
  return <JsonLd data={data} />;
}
