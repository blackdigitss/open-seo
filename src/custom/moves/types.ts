import type { InferSelectModel } from "drizzle-orm";
import type {
  MOVE_RISK_TIERS,
  MOVE_SOURCES,
  MOVE_STATUSES,
  MOVE_TYPES,
  MOVE_VALUE_BUCKETS,
  customMoves,
} from "@/db/custom/schema";

export type MoveRow = InferSelectModel<typeof customMoves>;
export type MoveType = (typeof MOVE_TYPES)[number];
export type MoveSource = (typeof MOVE_SOURCES)[number];
export type MoveRiskTier = (typeof MOVE_RISK_TIERS)[number];
export type MoveStatus = (typeof MOVE_STATUSES)[number];
export type MoveValueBucket = (typeof MOVE_VALUE_BUCKETS)[number];

/** What a producer hands the repository. Ids, timestamps and status are the
 *  repository's business. */
export type MoveInput = {
  projectId: string;
  dedupeKey: string;
  type: MoveType;
  source: MoveSource;
  title: string;
  hypothesis: string;
  reason: string;
  evidence: Record<string, unknown>;
  targetUrl?: string | null;
  targetQuery?: string | null;
  before?: string | null;
  after?: string | null;
  draft?: string | null;
  snippet?: string | null;
  whySafe?: string | null;
  riskTier: MoveRiskTier;
  score: number;
  scoreInputs: Record<string, unknown>;
  valueBucket?: MoveValueBucket | null;
  verifyUrl?: string | null;
  /** Days after apply until the verdict is due. Default 28. */
  reviewAfterDays?: number;
};

/** What the verification crawl expects to find live. Stored inside
 *  evidence.verify so the crawl has no source-specific logic. */
export type VerifyExpectation =
  | { kind: "title"; equals?: string; minLength?: number; maxLength?: number }
  | {
      kind: "meta_description";
      present: true;
      minLength?: number;
      maxLength?: number;
    }
  | { kind: "canonical"; equals?: string; present?: true }
  | { kind: "jsonld"; type: string }
  | { kind: "images_alt"; maxMissing: number }
  | { kind: "status"; equals: number }
  | { kind: "text_present"; text: string }
  | { kind: "none" };

export type Verdict = {
  computedAt: string;
  metric: "clicks";
  before: number;
  after: number;
  lastYearBefore: number | null;
  lastYearAfter: number | null;
  changePct: number | null;
  seasonalChangePct: number | null;
  reading: "improved" | "flat" | "declined" | "inconclusive";
  summary: string;
};
