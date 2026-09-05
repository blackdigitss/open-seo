// Resolves the D1 / KV / R2 ids the app's alchemy "selfhost" deploy created and
// writes them into wrangler.custom.jsonc, so the custom Worker binds the same
// resources. Needs CLOUDFLARE_API_TOKEN (Workers/D1/KV/R2 read) and the
// account id (CLOUDFLARE_ACCOUNT_ID or --account).
//
//   node scripts/custom/worker-config.mjs [--stage selfhost] [--app-url https://…]
import { readFileSync, writeFileSync } from "node:fs";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1]] : null))
    .filter(Boolean),
);
const stage = args.stage ?? "selfhost";
const token = process.env.CLOUDFLARE_API_TOKEN;
const account = args.account ?? process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token || !account) {
  console.error(
    "Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (or --account).",
  );
  process.exit(1);
}

const api = async (path) => {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}${path}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const json = await res.json();
  if (!json.success) throw new Error(`${path}: ${JSON.stringify(json.errors)}`);
  return json.result;
};

const pick = (items, nameOf, label) => {
  const wanted = items.filter((item) => nameOf(item).includes(stage));
  if (wanted.length === 0) {
    console.error(
      `No ${label} whose name contains "${stage}". Found: ${items.map(nameOf).join(", ") || "(none)"}`,
    );
    process.exit(1);
  }
  if (wanted.length > 1) {
    console.error(
      `Several ${label}s match "${stage}": ${wanted.map(nameOf).join(", ")} — pass --stage with a longer name.`,
    );
    process.exit(1);
  }
  return wanted[0];
};

const [d1s, kvs, r2s] = await Promise.all([
  api("/d1/database"),
  api("/storage/kv/namespaces"),
  api("/r2/buckets").then((r) => r.buckets ?? r),
]);
// The app's alchemy stack binds one KV as "KV" (OAUTH_KV is hosted-only); the
// stage-named one without "oauth" in its title is it.
const d1 = pick(d1s, (d) => d.name, "D1 database");
const kv = pick(
  kvs.filter((k) => !/oauth/i.test(k.title)),
  (k) => k.title,
  "KV namespace",
);
const r2 = pick(r2s, (b) => b.name, "R2 bucket");

let config = readFileSync("wrangler.custom.jsonc", "utf8");
const replace = (pattern, value) => {
  config = config.replace(pattern, value);
};
replace(
  /"id": "[^"]*"(\s*,?\s*\n\s*\},?\s*\n\s*\],\s*\n\s*"d1_databases")/,
  `"id": "${kv.id}"$1`,
);
replace(/"database_name": "[^"]*"/, `"database_name": "${d1.name}"`);
replace(/"database_id": "[^"]*"/, `"database_id": "${d1.uuid}"`);
replace(/"bucket_name": "[^"]*"/, `"bucket_name": "${r2.name}"`);
if (args["app-url"]) {
  replace(
    /"CUSTOM_APP_URL": "[^"]*"/,
    `"CUSTOM_APP_URL": "${args["app-url"]}"`,
  );
}
writeFileSync("wrangler.custom.jsonc", config);
console.log(
  `wrangler.custom.jsonc → D1 ${d1.name} (${d1.uuid}), KV ${kv.title} (${kv.id}), R2 ${r2.name}`,
);
