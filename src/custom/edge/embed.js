// Drop-in for raw-router (or any Worker that already serves a site): apply the
// OpenSEO edge rules to an outgoing HTML response. Dependency-free, fail-open.
//
// Wiring in raw-router (see docs/FORK_DEPLOY.md "RAW integration"):
//   1. Bind the shared KV namespace as OPENSEO_KV
//      (id 1597cbb99fe440d89a7df395da5de7e4) in raw-router's wrangler config.
//   2. Copy this file next to worker.js and:
//        import { applyOpenSeoRules } from "./openseo-edge-embed.js";
//   3. At the ONE place fetchFromPages returns its final 200 HTML response:
//        return applyOpenSeoRules(response, url, env.OPENSEO_KV);
//
// Contract, identical to the standalone edge worker:
//   - only 200 text/html responses are considered; everything else (the 3xx
//     redirect path, assets, errors) is returned untouched
//   - any failure — KV down, malformed rules, rewriter throwing — returns the
//     origin's bytes; this module cannot 500 the site
//   - rules never inspect the visitor: Googlebot and a person get the same bytes
//   - a kill flag in the rules JSON, or deleting the KV key, turns it all off
//     within ~60 seconds

function escapeHtmlText(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function escapeAttr(value) {
  return escapeHtmlText(value).replace(/"/g, "&quot;");
}
function normalizePath(pathname) {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed.toLowerCase();
}

export async function applyOpenSeoRules(response, url, kv) {
  try {
    if (!kv || response.status !== 200) return response;
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return response;

    const raw = await kv.get(
      `custom:edge_rules:${url.hostname.toLowerCase()}`,
      {
        cacheTtl: 60,
      },
    );
    if (!raw) return response;
    const ruleSet = JSON.parse(raw);
    if (!ruleSet || ruleSet.kill) return response;

    const path = normalizePath(url.pathname);
    const rules = (ruleSet.rules || []).filter((rule) => rule.path === path);
    if (rules.length === 0) return response;

    const title = rules.find((rule) => rule.kind === "title");
    const meta = rules.find((rule) => rule.kind === "meta_description");

    // Buffer so a mid-transform failure can still serve the original bytes.
    const originalBody = await response.text();
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.delete("content-encoding");
    headers.delete("etag");
    headers.delete("last-modified");

    try {
      let hasTitle = false;
      let hasMeta = false;
      await new HTMLRewriter()
        .on("head title", { element: () => (hasTitle = true) })
        .on('head meta[name="description"]', {
          element: () => (hasMeta = true),
        })
        .transform(new Response(originalBody))
        .text();

      const rewriter = new HTMLRewriter();
      if (title && hasTitle) {
        rewriter.on("head title", {
          element: (el) => el.setInnerContent(title.value),
        });
      }
      if (meta && hasMeta) {
        rewriter.on('head meta[name="description"]', {
          element: (el) => el.setAttribute("content", meta.value),
        });
      }
      if ((title && !hasTitle) || (meta && !hasMeta)) {
        rewriter.on("head", {
          element: (el) => {
            if (title && !hasTitle) {
              el.append(`<title>${escapeHtmlText(title.value)}</title>`, {
                html: true,
              });
            }
            if (meta && !hasMeta) {
              el.append(
                `<meta name="description" content="${escapeAttr(meta.value)}">`,
                { html: true },
              );
            }
          },
        });
      }
      const rewritten = await rewriter
        .transform(new Response(originalBody))
        .text();
      return new Response(rewritten, { status: 200, headers });
    } catch (error) {
      console.error("[openseo-edge] transform failed; serving origin", error);
      return new Response(originalBody, { status: 200, headers });
    }
  } catch (error) {
    console.error("[openseo-edge] skipped", error);
    return response;
  }
}
