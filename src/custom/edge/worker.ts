// The SEO edge ("open-seo-edge"): a zone-routed Worker that applies approved
// title/meta rules to HTML on its way out of the origin. Designed to be unable
// to take the site down (DECISIONS.md, "Edge layer design"):
//
//   - no rules / any error / kill flag  ->  the origin's bytes, untouched
//   - only 200 text/html responses are ever transformed
//   - the origin response is buffered and transformed inside try/catch;
//     an exception returns the buffered original, never a truncated page
//   - rules never key on user agent — Googlebot and a visitor get identical
//     bytes (the cloaking invariant)
//   - rewritten HTML is never cached here and never carries validators
//
// Rules live in KV (written by the app's auto-apply job); a 60s cacheTtl keeps
// reads local without making a kill flag slow to land.
import {
  EMPTY_RULESET,
  rulesForPath,
  rulesKvKey,
  escapeAttr,
  escapeHtmlText,
  type EdgeRule,
  type EdgeRuleSet,
} from "./rules";

interface EdgeEnv {
  KV: KVNamespace;
}

function passthroughHeaders(headers: Headers): Headers {
  const out = new Headers(headers);
  // The body length changed and validators would let a browser or crawler
  // 304 its way back to the pre-rule page.
  out.delete("content-length");
  out.delete("content-encoding");
  out.delete("etag");
  out.delete("last-modified");
  return out;
}

async function loadRules(env: EdgeEnv, host: string): Promise<EdgeRuleSet> {
  try {
    const raw = await env.KV.get(rulesKvKey(host), { cacheTtl: 60 });
    if (!raw) return EMPTY_RULESET;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return EMPTY_RULESET;
    return { ...EMPTY_RULESET, ...(parsed as Partial<EdgeRuleSet>) };
  } catch {
    return EMPTY_RULESET;
  }
}

async function transform(html: string, rules: EdgeRule[]): Promise<string> {
  const title = rules.find((rule) => rule.kind === "title");
  const meta = rules.find((rule) => rule.kind === "meta_description");

  // Detect pass: does the document already carry the tags we'd replace?
  let hasTitle = false;
  let hasMeta = false;
  await new HTMLRewriter()
    .on("head title", {
      element() {
        hasTitle = true;
      },
    })
    .on('head meta[name="description"]', {
      element() {
        hasMeta = true;
      },
    })
    .transform(new Response(html))
    .text();

  // Apply pass: replace in place; append into <head> what's missing.
  const rewriter = new HTMLRewriter();
  if (title && hasTitle) {
    rewriter.on("head title", {
      element(element) {
        element.setInnerContent(title.value);
      },
    });
  }
  if (meta && hasMeta) {
    rewriter.on('head meta[name="description"]', {
      element(element) {
        element.setAttribute("content", meta.value);
      },
    });
  }
  if ((title && !hasTitle) || (meta && !hasMeta)) {
    rewriter.on("head", {
      element(element) {
        if (title && !hasTitle) {
          element.append(`<title>${escapeHtmlText(title.value)}</title>`, {
            html: true,
          });
        }
        if (meta && !hasMeta) {
          element.append(
            `<meta name="description" content="${escapeAttr(meta.value)}">`,
            { html: true },
          );
        }
      },
    });
  }
  return rewriter.transform(new Response(html)).text();
}

export default {
  async fetch(request: Request, env: EdgeEnv): Promise<Response> {
    // Same-zone subrequest falls through to the origin (the Pages custom
    // domain); strip validators so we always see full bytes.
    const originRequest = new Request(request);
    originRequest.headers.delete("if-none-match");
    originRequest.headers.delete("if-modified-since");
    const origin = await fetch(originRequest);

    if (request.method !== "GET" || origin.status !== 200) return origin;
    const contentType = origin.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return origin;

    const url = new URL(request.url);
    const ruleSet = await loadRules(env, url.hostname);
    const rules = rulesForPath(ruleSet, url.pathname);
    if (rules.length === 0) return origin;

    // Buffer, then transform inside the safety net.
    const originalBody = await origin.text();
    const headers = passthroughHeaders(origin.headers);
    try {
      const rewritten = await transform(originalBody, rules);
      return new Response(rewritten, { status: 200, headers });
    } catch (error) {
      console.error("[edge] transform failed; serving origin", error);
      return new Response(originalBody, { status: 200, headers });
    }
  },
};
