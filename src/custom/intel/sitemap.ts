// Minimal sitemap reader: the index-or-urlset at /sitemap.xml, one level of
// child sitemaps, capped hard — these are 10-50 page sites, not crawls.
const MAX_URLS = 500;
const MAX_CHILD_SITEMAPS = 5;
const UA = "Mozilla/5.0 (compatible; OpenSEO-Verify/1.0; +https://openseo.so)";

function extract(tag: "loc", xml: string): string[] {
  const out: string[] = [];
  const pattern = /<loc>\s*([^<]+?)\s*<\/loc>/g;
  let match;
  while ((match = pattern.exec(xml)) !== null) {
    out.push(match[1]);
    if (out.length >= MAX_URLS) break;
  }
  return out;
}

async function fetchXml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/xml,text/xml,*/*" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

/** Every page URL the site's sitemap declares, or null when there is no
 *  readable sitemap (which is its own finding). */
export async function readSitemapUrls(host: string): Promise<string[] | null> {
  const xml = await fetchXml(`https://${host}/sitemap.xml`);
  if (!xml) return null;

  const locs = extract("loc", xml);
  // A sitemap index points at child sitemaps rather than pages.
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  if (!isIndex) return locs;

  const urls: string[] = [];
  for (const child of locs.slice(0, MAX_CHILD_SITEMAPS)) {
    const childXml = await fetchXml(child);
    if (!childXml) continue;
    urls.push(...extract("loc", childXml));
    if (urls.length >= MAX_URLS) break;
  }
  return urls.slice(0, MAX_URLS);
}
