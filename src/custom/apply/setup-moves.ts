// One-time setup a project needs before the rest of the automation pays off.
// Today that is the IndexNow key file: once it is live, every verified Move
// gets submitted the morning it lands.
import { indexNowKeyFile } from "./snippets";
import {
  SettingsRepository,
  type ProjectSettings,
} from "@/custom/settings/repository";
import type { MoveInput } from "@/custom/moves/types";

function hostOf(domain: string): string {
  return domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

export async function produceSetupMoves(input: {
  projectId: string;
  domain: string | null;
  settings: ProjectSettings;
}): Promise<MoveInput[]> {
  if (!input.domain) return [];
  const host = hostOf(input.domain);

  let key = input.settings.indexnowKey;
  if (!key) {
    key = crypto.randomUUID().replace(/-/g, "");
    await SettingsRepository.updateProject(input.projectId, {
      indexnowKey: key,
    });
  }

  // The Move stays open until the owner marks it Done and the file verifies;
  // upsert leaves applied and verified Moves alone, so it never nags twice.
  return [
    {
      projectId: input.projectId,
      dedupeKey: "setup:indexnow",
      type: "fix",
      source: "setup",
      title: "Add the IndexNow key file",
      hypothesis:
        "With the key file live, every change you apply here gets submitted to Bing and the other IndexNow engines the morning it is verified, instead of waiting to be recrawled.",
      reason:
        "one-time setup · unlocks instant submission for every later move",
      evidence: {
        host,
        key,
        keyFile: `${key}.txt`,
        verify: { kind: "text_present", text: key },
      },
      targetUrl: `https://${host}/${key}.txt`,
      draft: `Create a file called ${key}.txt at the root of ${host}, containing exactly this one line:\n\n${indexNowKeyFile(key)}\n\nOn Cloudflare Pages, drop it in the published output folder. It must be reachable at https://${host}/${key}.txt.`,
      snippet: indexNowKeyFile(key),
      whySafe:
        "A static text file at a new path. Nothing about the existing site changes.",
      riskTier: "safe",
      score: 0.35,
      scoreInputs: { setup: 1 },
      valueBucket: null,
      verifyUrl: `https://${host}/${key}.txt`,
    },
  ];
}
