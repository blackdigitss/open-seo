import { describe, expect, it } from "vitest";
import {
  faqPageJsonLd,
  localBusinessJsonLd,
  metaDescriptionTag,
  redirectRuleLine,
  titleTag,
} from "./snippets";

function parseJsonLd(block: string): unknown {
  const body = block
    .replace(/^<script type="application\/ld\+json">\n/, "")
    .replace(/\n<\/script>$/, "");
  return JSON.parse(body);
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
    ) as { "@type": string; mainEntity: Array<{ name: string }> };
    expect(parsed["@type"]).toBe("FAQPage");
    expect(parsed.mainEntity[0].name).toBe("Do you travel?");
  });

  it("omits address entirely when no address parts are known", () => {
    const parsed = parseJsonLd(
      localBusinessJsonLd({
        name: "Walker's Notary",
        url: "https://example.com",
      }),
    ) as Record<string, unknown>;
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
    ) as { "@type": string; address: Record<string, unknown> };
    expect(parsed["@type"]).toBe("ProfessionalService");
    expect(parsed.address).toEqual({
      "@type": "PostalAddress",
      addressLocality: "Brooklyn",
      addressRegion: "NY",
    });
  });

  it("writes a redirect line hosts understand", () => {
    expect(redirectRuleLine("/old", "/new")).toBe("/old  /new  301");
  });
});
