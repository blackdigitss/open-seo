// The nightly pass that turns signals into Moves. Every producer runs behind
// its own try/catch: a project with no GSC grant, or an audit that never ran,
// must not stop the others.
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { ProjectContextService } from "@/server/features/project-context/services/ProjectContextService";
import { produceSetupMoves } from "@/custom/apply/setup-moves";
import { MovesRepository } from "@/custom/moves/repository";
import { produceAuditMoves } from "@/custom/moves/producers/audit";
import { produceDecay } from "@/custom/moves/producers/decay";
import { produceOpenings } from "@/custom/moves/producers/openings";
import { normalizeUrl, type PageRole } from "@/custom/moves/producers/types";
import type { MoveInput, MoveRow } from "@/custom/moves/types";
import { formatBucket } from "@/custom/moves/score";
import { notify } from "@/custom/notify";
import { SettingsRepository } from "@/custom/settings/repository";
import { createLogger, errorMessage } from "@/custom/lib/log";
import type { JobDefinition } from "./runner";
import { dailyAfter } from "./schedule";

/** Only a genuinely good new Move earns an interruption; the rest wait for
 *  Monday. */
const NOTIFY_SCORE = 0.6;

async function loadContext(projectId: string) {
  try {
    const context = await ProjectContextService.getProjectContext(projectId);
    const pageRoles = new Map<string, PageRole>();
    for (const page of context.keyPages) {
      pageRoles.set(normalizeUrl(page.url), page.role as PageRole);
    }
    const voice = context.sections
      .filter((section) =>
        ["business_overview", "positioning", "writing_preferences"].includes(
          section.key,
        ),
      )
      .map((section) => `${section.key}: ${section.content}`)
      .join("\n\n");
    return { pageRoles, voice };
  } catch {
    return { pageRoles: new Map<string, PageRole>(), voice: "" };
  }
}

/** Upserts a producer's Moves and reports which of them are genuinely new. */
async function applyProducerResult(moves: MoveInput[]) {
  const fresh: MoveRow[] = [];
  let created = 0;
  let refreshed = 0;
  for (const move of moves) {
    const { row, created: isNew } = await MovesRepository.upsert(move);
    if (isNew) {
      created += 1;
      fresh.push(row);
    } else {
      refreshed += 1;
    }
  }
  return { created, refreshed, fresh };
}

export const movesRefreshJob: JobDefinition = {
  name: "moves_refresh",
  due: dailyAfter(8, 30),
  run: async ({ env, log }) => {
    const rows = await db
      .select({
        id: projects.id,
        name: projects.name,
        domain: projects.domain,
        organizationId: projects.organizationId,
      })
      .from(projects)
      .where(sql`${projects.archivedAt} is null`);

    let created = 0;
    let refreshed = 0;
    let resolved = 0;

    for (const project of rows) {
      const projectLog = createLogger(`moves:${project.name}`);
      const settings = await SettingsRepository.getProject(project.id);
      const { pageRoles, voice } = await loadContext(project.id);
      const economics = SettingsRepository.economicsFor(settings, null);
      const input = {
        env,
        projectId: project.id,
        organizationId: project.organizationId,
        domain: project.domain,
        economics,
        pageRoles,
        voice,
        log: projectLog,
      };

      const producers: Array<{
        source: MoveInput["source"];
        run: () => Promise<{ moves: MoveInput[]; liveKeys: string[] }>;
      }> = [
        { source: "striking_distance", run: () => produceOpenings(input) },
        { source: "decay", run: () => produceDecay(input) },
        { source: "audit", run: () => produceAuditMoves(input) },
        {
          source: "setup",
          run: async () => {
            const moves = await produceSetupMoves({
              projectId: project.id,
              domain: project.domain,
              settings,
            });
            return { moves, liveKeys: moves.map((move) => move.dedupeKey) };
          },
        },
      ];

      const fresh: MoveRow[] = [];
      for (const producer of producers) {
        try {
          const result = await producer.run();
          const outcome = await applyProducerResult(result.moves);
          created += outcome.created;
          refreshed += outcome.refreshed;
          fresh.push(...outcome.fresh);
          resolved += await MovesRepository.resolveMissing(
            project.id,
            producer.source,
            result.liveKeys,
          );
        } catch (error) {
          projectLog(`${producer.source} failed`, {
            error: errorMessage(error),
          });
        }
      }

      // One message per project per run, and only for Moves worth stopping for.
      const worthTelling = fresh.filter((move) => move.score >= NOTIFY_SCORE);
      if (worthTelling.length > 0) {
        const label = project.domain ?? project.name;
        await notify(env, {
          organizationId: project.organizationId,
          projectId: project.id,
          kind: "event",
          title:
            worthTelling.length === 1
              ? `${worthTelling[0].title} — ${label}`
              : `${worthTelling.length} new moves for ${label}`,
          body: worthTelling
            .map((move) => {
              const bucket = formatBucket(move.valueBucket);
              return `- **${move.title}** — ${move.reason}${bucket ? ` (${bucket})` : ""}`;
            })
            .join("\n"),
          url: `${env.CUSTOM_APP_URL ?? ""}/moves`,
          moveId: worthTelling.length === 1 ? worthTelling[0].id : null,
        });
      }
    }

    log("done", { created, refreshed, resolved });
    return { projects: rows.length, created, refreshed, resolved };
  },
};
