// Copy-ready output. Every Move hands the owner the exact thing to paste, so
// "apply" is a paste and a deploy rather than a research task.

export function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function titleTag(title: string): string {
  return `<title>${escapeText(title.trim())}</title>`;
}

export function metaDescriptionTag(text: string): string {
  return `<meta name="description" content="${escapeAttribute(text.trim())}">`;
}

export function selfCanonical(url: string): string {
  return `<link rel="canonical" href="${escapeAttribute(url.trim())}">`;
}

function jsonLdBlock(data: unknown): string {
  return `<script type="application/ld+json">\n${JSON.stringify(data, null, 2)}\n</script>`;
}

export function faqPageJsonLd(
  qa: Array<{ question: string; answer: string }>,
): string {
  return jsonLdBlock({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: qa.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  });
}

export type LocalBusinessInput = {
  name: string;
  url: string;
  type?: string;
  description?: string;
  telephone?: string;
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
  areaServed?: string[];
};

export function localBusinessJsonLd(input: LocalBusinessInput): string {
  const address = {
    streetAddress: input.streetAddress,
    addressLocality: input.addressLocality,
    addressRegion: input.addressRegion,
    postalCode: input.postalCode,
  };
  const hasAddress = Object.values(address).some(Boolean);
  return jsonLdBlock({
    "@context": "https://schema.org",
    "@type": input.type ?? "LocalBusiness",
    name: input.name,
    url: input.url,
    ...(input.description ? { description: input.description } : {}),
    ...(input.telephone ? { telephone: input.telephone } : {}),
    ...(hasAddress
      ? {
          address: Object.fromEntries(
            Object.entries({ "@type": "PostalAddress", ...address }).filter(
              ([, value]) => Boolean(value),
            ),
          ),
        }
      : {}),
    ...(input.areaServed?.length ? { areaServed: input.areaServed } : {}),
  });
}

/** A line for Cloudflare Pages' `_redirects` (also readable enough to hand to
 *  any other host). */
export function redirectRuleLine(
  from: string,
  to: string,
  status = 301,
): string {
  return `${from}  ${to}  ${status}`;
}

export function indexNowKeyFile(key: string): string {
  return key;
}
