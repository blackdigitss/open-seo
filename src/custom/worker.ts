// The fork's scheduled Worker ("open-seo-custom"). Runs every job in
// src/custom/jobs/ against the same D1/KV the app uses, so upstream's
// server.ts, wrangler.jsonc and alchemy.run.ts stay untouched (see FORK.md).
// Deployed with plain `wrangler deploy -c wrangler.custom.jsonc`.
import { withPgClient } from "@/db";
import { findJob, jobs } from "./jobs/registry";
import { runDueJobs, runJobNow } from "./jobs/runner";
import { getRecentRuns } from "./jobs/status";
import { KV_WORKER_SEEN_AT } from "./jobs/config-sync";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default {
  async fetch(request: Request, env: Cloudflare.Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      const [runs, lastTick] = await Promise.all([
        withPgClient(() => getRecentRuns(30)),
        env.KV.get(KV_WORKER_SEEN_AT),
      ]);
      return json({
        ok: true,
        jobs: jobs.map((job) => job.name),
        paused: env.CUSTOM_JOBS_DISABLED === "1",
        lastTick,
        runs,
      });
    }

    // Manual trigger: POST /run?job=<name> with the shared secret.
    if (url.pathname === "/run" && request.method === "POST") {
      const secret = request.headers.get("x-run-secret");
      if (!env.CUSTOM_RUN_SECRET || secret !== env.CUSTOM_RUN_SECRET) {
        return json({ error: "unauthorized" }, 401);
      }
      const name = url.searchParams.get("job") ?? "";
      const job = findJob(name);
      if (!job) return json({ error: `unknown job "${name}"` }, 404);
      try {
        const result = await withPgClient(() =>
          runJobNow(env, job, new Date()),
        );
        return json(result);
      } catch (error) {
        console.error(`[custom:${name}] manual run failed`, error);
        return json(
          { error: error instanceof Error ? error.message : String(error) },
          500,
        );
      }
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(
    _controller: ScheduledController,
    env: Cloudflare.Env,
    _ctx: ExecutionContext,
  ) {
    if (env.CUSTOM_JOBS_DISABLED === "1") return;
    await withPgClient(() => runDueJobs(env, jobs, new Date()));
  },
};
