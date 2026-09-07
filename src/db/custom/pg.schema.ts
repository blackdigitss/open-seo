// Postgres mirror of ./schema.ts. Same column shapes (timestamps as text, see
// src/db/pg/app.schema.ts); ./schema-parity.test.ts fails if the two drift.
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projects } from "../pg/app.schema";
import { organization } from "../pg/better-auth-schema";
import {
  MOVE_RISK_TIERS,
  MOVE_SOURCES,
  MOVE_STATUSES,
  MOVE_TYPES,
  MOVE_VALUE_BUCKETS,
  NOTIFICATION_KINDS,
  SNAPSHOT_KINDS,
} from "./schema";

const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export const customMoves = pgTable(
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
    reason: text("reason").notNull(),
    evidenceJson: text("evidence_json").notNull().default("{}"),
    targetUrl: text("target_url"),
    targetQuery: text("target_query"),
    before: text("before"),
    after: text("after"),
    draft: text("draft"),
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
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
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

export const customNotifications = pgTable(
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
    body: text("body").notNull(),
    url: text("url"),
    moveId: text("move_id"),
    readAt: text("read_at"),
    emailSentAt: text("email_sent_at"),
    pushSentAt: text("push_sent_at"),
    imessageSentAt: text("imessage_sent_at"),
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    index("custom_notifications_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
  ],
);

export const customOrgSettings = pgTable("custom_org_settings", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  notifyEmail: boolean("notify_email").notNull().default(true),
  notifyPush: boolean("notify_push").notNull().default(true),
  notifyImessage: boolean("notify_imessage").notNull().default(false),
  imessageTo: text("imessage_to"),
  weeklyPlanDay: integer("weekly_plan_day").notNull().default(1),
  weeklyPlanHourUtc: integer("weekly_plan_hour_utc").notNull().default(11),
  monthlyBudgetUsd: real("monthly_budget_usd").notNull().default(25),
  updatedAt: text("updated_at").notNull().default(isoNow),
});

export const customProjectSettings = pgTable("custom_project_settings", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  valuePerLeadUsd: real("value_per_lead_usd").notNull().default(100),
  closeRate: real("close_rate").notNull().default(0.5),
  siteConversionRate: real("site_conversion_rate"),
  monthlyBudgetUsd: real("monthly_budget_usd").notNull().default(10),
  autoApplySafe: boolean("auto_apply_safe").notNull().default(false),
  reviewsBusinessName: text("reviews_business_name"),
  reviewsLocationName: text("reviews_location_name"),
  indexnowKey: text("indexnow_key"),
  updatedAt: text("updated_at").notNull().default(isoNow),
});

export const customGscDaily = pgTable(
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

export const customGscQueryDaily = pgTable(
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

export const customJobRuns = pgTable(
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

export const customDataforseoCalls = pgTable(
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

export const customPushSubscriptions = pgTable(
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
    createdAt: text("created_at").notNull().default(isoNow),
    lastUsedAt: text("last_used_at"),
    failedAt: text("failed_at"),
  },
  (table) => [
    uniqueIndex("custom_push_subscriptions_endpoint_idx").on(table.endpoint),
  ],
);

export const customSnapshots = pgTable(
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

export const customReviews = pgTable(
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
    ownerReplied: boolean("owner_replied").notNull().default(false),
    seenAt: text("seen_at").notNull(),
  },
  (table) => [
    uniqueIndex("custom_reviews_project_external_idx").on(
      table.projectId,
      table.externalId,
    ),
  ],
);
