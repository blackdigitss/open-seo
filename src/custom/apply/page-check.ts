// Fetches a page and reduces it to the handful of facts a verification needs.
import * as cheerio from "cheerio";
import type { PageFacts } from "./page-facts";

const USER_AGENT =
  "Mozilla/5.0 (compatible; OpenSEO-Verify/1.0; +https://openseo.so)";
// Enough for any small-business page; guards against a stray huge document.
const MAX_BYTES = 1_500_000;

function collectJsonLdTypes(raw: string): string[] {
  const types: string[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const type = record["@type"];
    if (typeof type === "string") types.push(type);
    if (Array.isArray(type)) {
      for (const t of type) if (typeof t === "string") types.push(t);
    }
    // Nested @graph and any object-valued property can carry more types.
    for (const value of Object.values(record)) visit(value);
  };
  try {
    visit(JSON.parse(raw));
  } catch {
    // A malformed block is simply no evidence of the type we wanted.
  }
  return types;
}

export async function fetchPageFacts(
  url: string,
  options: { timeoutMs?: number } = {},
): Promise<PageFacts> {
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" },
    redirect: "follow",
    signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
  });

  const raw = await response.text();
  const html = raw.length > MAX_BYTES ? raw.slice(0, MAX_BYTES) : raw;
  const $ = cheerio.load(html);

  const jsonLdTypes: string[] = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    jsonLdTypes.push(...collectJsonLdTypes($(element).text()));
  });

  const images = $("img");
  let imagesMissingAlt = 0;
  images.each((_, element) => {
    const alt = $(element).attr("alt");
    if (!alt || alt.trim() === "") imagesMissingAlt += 1;
  });

  $("script, style, noscript").remove();

  return {
    status: response.status,
    finalUrl: response.url || url,
    title: $("head title").first().text().trim() || null,
    metaDescription:
      $('meta[name="description"]').attr("content")?.trim() || null,
    canonical: $('link[rel="canonical"]').attr("href")?.trim() || null,
    robotsMeta: $('meta[name="robots"]').attr("content")?.trim() || null,
    jsonLdTypes: [...new Set(jsonLdTypes)],
    imagesTotal: images.length,
    imagesMissingAlt,
    textSample: $("body").text().replace(/\s+/g, " ").trim().slice(0, 2000),
  };
}
