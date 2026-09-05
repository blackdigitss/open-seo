// Pushes the custom Worker's secrets in one `wrangler secret bulk` call:
// the shared ones from .env.selfhost plus everything in .env.custom.
//
//   node scripts/custom/secrets.mjs
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const SHARED = [
  "DATAFORSEO_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "BETTER_AUTH_SECRET",
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
];

function parse(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) out[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

const selfhost = parse(".env.selfhost");
const custom = parse(".env.custom");
const secrets = {};
for (const key of SHARED) if (selfhost[key]) secrets[key] = selfhost[key];
for (const [key, value] of Object.entries(custom))
  if (value) secrets[key] = value;

// A placeholder DataForSEO key would make every paid job fail loudly; leave
// the secret unset so the jobs skip instead.
if (secrets.DATAFORSEO_API_KEY?.startsWith("PLACEHOLDER"))
  delete secrets.DATAFORSEO_API_KEY;

const names = Object.keys(secrets);
if (names.length === 0) {
  console.log("No secrets to push.");
  process.exit(0);
}
const tmp = `.secrets-${Date.now()}.json`;
writeFileSync(tmp, JSON.stringify(secrets));
try {
  execSync(`pnpm exec wrangler secret bulk ${tmp} -c wrangler.custom.jsonc`, {
    stdio: "inherit",
  });
  console.log(`Pushed ${names.length} secret(s): ${names.join(", ")}`);
} finally {
  unlinkSync(tmp);
}
