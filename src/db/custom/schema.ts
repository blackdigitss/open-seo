// Fork-owned tables (SQLite). Mirrored by hand in ./pg.schema.ts and guarded by
// ./schema-parity.test.ts. Never re-export these from upstream's schema
// barrels: drizzle.config.ts reads src/db/d1/schema.ts, and anything reachable
// from there lands in upstream's migration journal. Migrations for these tables
// come from drizzle-custom.config.ts into drizzle/custom/.
//
// Timestamps are ISO-8601 text written by the app (new Date().toISOString());
// the column defaults exist only so raw inserts never leave them null.
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { projects } from "../app.schema";
import { organization } from "../better-auth-schema";

const now = sql`(current_timestamp)`;

export const MOVE_TYPES = ["fix", "opening"] as const;
export const MOVE_SOURCES = [
  "audit",
  "striking_distance",
  "opportunity",
  "decay",
  "review",
  "rank",
  "setup",
  "manual",
] as const;
export const MOVE_RISK_TIERS = ["safe", "risky"] as const;
export const MOVE_STATUSES = [
  "open",
  "applied",
  "skipped",
  "verified",
  "verify_failed",
  "resolved",
  "concluded",
  // Real work, held back because a better Move on the same page already
  // rewrites the surface it targets. The nightly reconcile pass reopens it
  // once that Move is out of the way.
  "superseded",
] as const;
export const MOVE_VALUE_BUCKETS = ["low", "mid", "high"] as const;
export const NOTIFICATION_KINDS = [
  "weekly_plan",
  "event",
  "verdict",
  "system",
] as const;
export const SNAPSHOT_KINDS = [
  "brand_lookup",
  "rank_grid",
  "brand_volume",
  "competitor_gap",
  "reviews_summary",
] as const;

// The product's unit of work: a fix or an opening, born with a hypothesis, a
// draft, and a review date. `dedupeKey` lets the nightly producers upsert
// instead of piling up duplicates.
export const customMoves = sqliteTable(
  "custom_moves",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    dedupeKey: text("dedupe_key").notNull(),
    type: text("type", { enum: MOVE_TYPES }).notNull(),
    source: text("source", { enum: MOVE_SOURCES }).notNull(),
    title: text("title").notNull(),
    hypothesis: text("hypothesis").notNull(),
    // One line, human: "340 impr · pos 7.4 · /mobile-notary"
    reason: text("reason").notNull(),
    evidenceJson: text("evidence_json").notNull().default("{}"),
    targetUrl: text("target_url"),
    targetQuery: text("target_query"),
    before: text("before"),
    after: text("after"),
    // Prose the owner would otherwise have to write, in the project's voice.
    draft: text("draft"),
    // Copy-ready code: a <title>, a meta tag, a JSON-LD block, a redirect rule.
    snippet: text("snippet"),
    whySafe: text("why_safe"),
    riskTier: text("risk_tier", { enum: MOVE_RISK_TIERS }).notNull(),
    score: real("score").notNull().default(0),
    scoreInputsJson: text("score_inputs_json").notNull().default("{}"),
    valueBucket: text("value_bucket", { enum: MOVE_VALUE_BUCKETS }),
    status: text("status", { enum: MOVE_STATUSES }).notNull().default("open"),
    appliedAt: text("applied_at"),
    verifyUrl: text("verify_url"),
    verifiedAt: text("verified_at"),
    verifyResultJson: text("verify_result_json"),
    reviewAt: text("review_at"),
    verdictJson: text("verdict_json"),
    // The Move on the same page that holds this one's surface. Set only while
    // the status is "superseded"; no FK, so a deleted winner can't orphan a row.
    supersededBy: text("superseded_by"),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    uniqueIndex("custom_moves_project_dedupe_idx").on(
      table.projectId,
      table.dedupeKey,
    ),
    index("custom_moves_project_status_idx").on(table.projectId, table.status),
    index("custom_moves_review_at_idx").on(table.reviewAt),
  ],
);

// The in-app inbox. Every plan, event and verdict lands here first; email,
// push and iMessage are deliveries of the same row.
export const customNotifications = sqliteTable(
  "custom_notifications",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    kind: text("kind", { enum: NOTIFICATION_KINDS }).notNull(),
    title: text("title").notNull(),
    // Markdown.
    body: text("body").notNull(),
    url: text("url"),
    moveId: text("move_id"),
    readAt: text("read_at"),
    emailSentAt: text("email_sent_at"),
    pushSentAt: text("push_sent_at"),
    imessageSentAt: text("imessage_sent_at"),
    createdAt: text("created_at").notNull().default(now),
  },
  (table) => [
    index("custom_notifications_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
  ],
);

export const customOrgSettings = sqliteTable("custom_org_settings", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  notifyEmail: integer("notify_email", { mode: "boolean" })
    .notNull()
    .default(true),
  notifyPush: integer("notify_push", { mode: "boolean" })
    .notNull()
    .default(true),
  notifyImessage: integer("notify_imessage", { mode: "boolean" })
    .notNull()
    .default(false),
  // E.164 phone number for the BlueBubbles iMessage transport.
  imessageTo: text("imessage_to"),
  // ISO weekday (1 = Monday) and UTC hour the weekly plan goes out.
  weeklyPlanDay: integer("weekly_plan_day").notNull().default(1),
  weeklyPlanHourUtc: integer("weekly_plan_hour_utc").notNull().default(11),
  // Hard stop for scheduled DataForSEO spend across every project.
  monthlyBudgetUsd: real("monthly_budget_usd").notNull().default(25),
  updatedAt: text("updated_at").notNull().default(now),
});

// The site multiplier and per-project knobs. Value per lead × close rate ×
// site conversion rate is what makes a wedding lead outrank a notary lead.
export const customProjectSettings = sqliteTable("custom_project_settings", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  valuePerLeadUsd: real("value_per_lead_usd").notNull().default(100),
  closeRate: real("close_rate").notNull().default(0.5),
  // Null → derived from GA4 when connected, else 0.02.
  siteConversionRate: real("site_conversion_rate"),
  monthlyBudgetUsd: real("monthly_budget_usd").notNull().default(10),
  // Safe-tier moves get applied at the edge without asking, for domains the
  // SEO edge Worker covers. Off until the owner flips it.
  autoApplySafe: integer("auto_apply_safe", { mode: "boolean" })
    .notNull()
    .default(false),
  reviewsBusinessName: text("reviews_business_name"),
  reviewsLocationName: text("reviews_location_name"),
  indexnowKey: text("indexnow_key"),
  updatedAt: text("updated_at").notNull().default(now),
});

// Nightly append of Search Console rows the app otherwise fetches live and
// discards. Page totals drive decay and verdicts; page×query drives openings.
export const customGscDaily = sqliteTable(
  "custom_gsc_daily",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    page: text("page").notNull(),
    clicks: integer("clicks").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    ctr: real("ctr").notNull().default(0),
    position: real("position").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.date, table.page] }),
  ],
);

export const customGscQueryDaily = sqliteTable(
  "custom_gsc_query_daily",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    page: text("page").notNull(),
    query: text("query").notNull(),
    clicks: integer("clicks").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    position: real("position").notNull().default(0),
  },
  (table) => [
    primaryKey({
      columns: [table.projectId, table.date, table.page, table.query],
    }),
  ],
);

// One row per (job, period). The 5-minute cron claims a period once; a failed
// claim is retried a few times, a succeeded one never re-runs.
export const customJobRuns = sqliteTable(
  "custom_job_runs",
  {
    id: text("id").primaryKey(),
    job: text("job").notNull(),
    periodKey: text("period_key").notNull(),
    status: text("status", {
      enum: ["running", "succeeded", "failed"],
    }).notNull(),
    attempts: integer("attempts").notNull().default(1),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    summaryJson: text("summary_json"),
    error: text("error"),
  },
  (table) => [
    uniqueIndex("custom_job_runs_job_period_idx").on(
      table.job,
      table.periodKey,
    ),
  ],
);

// Every DataForSEO call's real billed cost. Self-host mode discards this
// upstream; one FORK line in the client records it here. No FK on project so
// spend history survives a project delete.
export const customDataforseoCalls = sqliteTable(
  "custom_dataforseo_calls",
  {
    id: text("id").primaryKey(),
    at: text("at").notNull(),
    path: text("path").notNull(),
    costUsd: real("cost_usd").notNull(),
    feature: text("feature"),
    projectId: text("project_id"),
    job: text("job"),
  },
  (table) => [index("custom_dataforseo_calls_at_idx").on(table.at)],
);

export const customPushSubscriptions = sqliteTable(
  "custom_push_subscriptions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: text("created_at").notNull().default(now),
    lastUsedAt: text("last_used_at"),
    failedAt: text("failed_at"),
  },
  (table) => [
    uniqueIndex("custom_push_subscriptions_endpoint_idx").on(table.endpoint),
  ],
);

// Third-party results the app runs and throws away (brand lookups, rank
// grids, brand search volume, competitor gaps), kept so "over time" exists.
export const customSnapshots = sqliteTable(
  "custom_snapshots",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: SNAPSHOT_KINDS }).notNull(),
    takenAt: text("taken_at").notNull(),
    summaryJson: text("summary_json").notNull().default("{}"),
    payloadJson: text("payload_json").notNull().default("{}"),
  },
  (table) => [
    index("custom_snapshots_project_kind_idx").on(
      table.projectId,
      table.kind,
      table.takenAt,
    ),
  ],
);

// Google Business reviews, normalized so "new since last scan" is a query.
export const customReviews = sqliteTable(
  "custom_reviews",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    author: text("author"),
    rating: real("rating"),
    text: text("text"),
    publishedAt: text("published_at"),
    ownerReplied: integer("owner_replied", { mode: "boolean" })
      .notNull()
      .default(false),
    seenAt: text("seen_at").notNull(),
  },
  (table) => [
    uniqueIndex("custom_reviews_project_external_idx").on(
      table.projectId,
      table.externalId,
    ),
  ],
);
