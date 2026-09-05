// One-time "setup" Moves a project needs before other automation works — for
// now the IndexNow key file. Filled in by the apply-loop task; moves-refresh
// calls this for every project.
import type { MoveInput } from "@/custom/moves/types";
import type { ProjectSettings } from "@/custom/settings/repository";

export async function produceSetupMoves(_input: {
  projectId: string;
  domain: string | null;
  settings: ProjectSettings;
}): Promise<MoveInput[]> {
  return [];
}
