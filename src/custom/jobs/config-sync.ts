// Publishes the few Worker-side values the app needs (the Web Push public key,
// the app URL) into the shared KV, so the app never needs its own copy of the
// custom Worker's config. Runs every tick but only writes on change.
import { isoNow } from "@/custom/lib/time";
import type { JobDefinition } from "./runner";
import { everyTick } from "./schedule";

export const KV_VAPID_PUBLIC_KEY = "custom:vapid_public_key";
export const KV_APP_URL = "custom:app_url";
export const KV_WORKER_SEEN_AT = "custom:worker_seen_at";

async function putIfChanged(kv: KVNamespace, key: string, value: string) {
  const current = await kv.get(key);
  if (current === value) return false;
  await kv.put(key, value);
  return true;
}

export const configSyncJob: JobDefinition = {
  name: "config_sync",
  due: everyTick,
  maxAttempts: 1,
  run: async ({ env }) => {
    const changed: string[] = [];
    if (env.VAPID_PUBLIC_KEY) {
      if (
        await putIfChanged(env.KV, KV_VAPID_PUBLIC_KEY, env.VAPID_PUBLIC_KEY)
      ) {
        changed.push("vapid");
      }
    }
    if (env.CUSTOM_APP_URL) {
      if (await putIfChanged(env.KV, KV_APP_URL, env.CUSTOM_APP_URL)) {
        changed.push("app_url");
      }
    }
    await env.KV.put(KV_WORKER_SEEN_AT, isoNow());
    return { changed };
  },
};
