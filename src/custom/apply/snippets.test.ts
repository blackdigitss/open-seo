import { describe, expect, it } from "vitest";
import {
  faqPageJsonLd,
  localBusinessJsonLd,
  metaDescriptionTag,
  redirectRuleLine,
  selfCanonical,
  titleTag,
} from "./snippets";

type JsonLd = {
  "@type"?: string;
  address?: Record<string, unknown>;
  mainEntity?: Array<{ name?: string }>;
};

function parseJsonLd(block: string): JsonLd {
  const body = block
    .replace(/^<script type="application\/ld\+json">\n/, "")
    .replace(/\n<\/script>$/, "");
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the module under test produced this
  return JSON.parse(body) as JsonLd;
}

describe("snippets", () => {
  it("escapes quotes so a description can't break out of the attribute", () => {
    expect(metaDescriptionTag('He said "hello" & left')).toBe(
      '<meta name="description" content="He said &quot;hello&quot; &amp; left">',
    );
  });

  it("escapes markup in a title", () => {
    expect(titleTag("A <b>bold</b> title")).toBe(
      "<title>A &lt;b&gt;bold&lt;/b&gt; title</title>",
    );
  });

  it("emits parseable FAQ JSON-LD", () => {
    const parsed = parseJsonLd(
      faqPageJsonLd([
        { question: "Do you travel?", answer: "Yes, anywhere in Brooklyn." },
      ]),
    );
    expect(parsed["@type"]).toBe("FAQPage");
    expect(parsed.mainEntity?.[0].name).toBe("Do you travel?");
  });

  it("omits address entirely when no address parts are known", () => {
    const parsed = parseJsonLd(
      localBusinessJsonLd({
        name: "Walker's Notary",
        url: "https://example.com",
      }),
    );
    expect(parsed["@type"]).toBe("LocalBusiness");
    expect(parsed.address).toBeUndefined();
  });

  it("keeps only the address parts it was given", () => {
    const parsed = parseJsonLd(
      localBusinessJsonLd({
        name: "Walker's Notary",
        url: "https://example.com",
        type: "ProfessionalService",
        addressLocality: "Brooklyn",
        addressRegion: "NY",
      }),
    );
    expect(parsed["@type"]).toBe("ProfessionalService");
    expect(parsed.address).toEqual({
      "@type": "PostalAddress",
      addressLocality: "Brooklyn",
      addressRegion: "NY",
    });
  });

  it("emits a self-canonical with the url escaped", () => {
    expect(selfCanonical("https://example.com/a?b=1&c=2")).toBe(
      '<link rel="canonical" href="https://example.com/a?b=1&amp;c=2">',
    );
  });

  it("writes a redirect line hosts understand", () => {
    expect(redirectRuleLine("/old", "/new")).toBe("/old  /new  301");
  });
});
