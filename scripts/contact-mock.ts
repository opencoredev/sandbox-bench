/**
 * A local stand-in for the console site's /contact endpoint, for checking the
 * private benchmarks form in a browser. Build the site against it with
 *
 *   NEXT_PUBLIC_CONSOLE_SITE_URL=http://127.0.0.1:8787 bun run build
 *
 * then run `bun scripts/contact-mock.ts [port]`. GET /__received lists what it took.
 * Company "force-400" or "force-500" forces that response; a filled honeypot is answered 200 and dropped.
 */
import { startContactMock } from "../src/lib/fixtures/contact-mock";

const port = Number(process.argv[2] ?? 8787);
const mock = await startContactMock(port);
console.log(`contact mock listening on ${mock.url}/contact`);
