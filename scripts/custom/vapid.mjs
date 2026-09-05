// Generates a Web Push VAPID key pair and appends it to .env.custom (creating
// the file from .env.custom.example when missing). Idempotent: existing keys
// are left alone.
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { webcrypto } from "node:crypto";

const envFile = ".env.custom";
if (!existsSync(envFile)) copyFileSync(".env.custom.example", envFile);
const current = readFileSync(envFile, "utf8");
if (
  /^VAPID_PUBLIC_KEY=\S+/m.test(current) &&
  /^VAPID_PRIVATE_JWK=\S+/m.test(current)
) {
  console.log("VAPID keys already present in .env.custom");
  process.exit(0);
}

const b64url = (bytes) =>
  Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const pair = await webcrypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);
const publicRaw = await webcrypto.subtle.exportKey("raw", pair.publicKey);
const privateJwk = await webcrypto.subtle.exportKey("jwk", pair.privateKey);
delete privateJwk.key_ops;
delete privateJwk.ext;

const next = current
  .replace(/^VAPID_PUBLIC_KEY=.*$/m, `VAPID_PUBLIC_KEY=${b64url(publicRaw)}`)
  .replace(
    /^VAPID_PRIVATE_JWK=.*$/m,
    `VAPID_PRIVATE_JWK=${JSON.stringify(privateJwk)}`,
  );
writeFileSync(envFile, next);
console.log("Wrote VAPID keys to .env.custom");
