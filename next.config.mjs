// BENCH_PREVIEW=1 builds from the fake fixture in src/data/preview/ (scripts/preview-fixture.ts)
// instead of the committed data, for layout checks only. The page shows a banner when it does.
const preview = process.env.BENCH_PREVIEW === "1";
const files = ["benchmark.default.json", "benchmark.same-spec.json", "extras.default.json", "extras.same-spec.json"];

/** @type {import('next').NextConfig} */
export default {
  output: "export",
  reactStrictMode: true,
  trailingSlash: true,
  ...(preview
    ? { turbopack: { resolveAlias: Object.fromEntries(files.map((f) => [`@/data/${f}`, `./src/data/preview/${f}`])) } }
    : {}),
};
