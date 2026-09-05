import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { customNotifications } from "@/db/custom/schema";
import { isoNow } from "@/custom/lib/time";

export type NotificationRow = typeof customNotifications.$inferSelect;
export type NotificationKind = NotificationRow["kind"];

export type NotificationInput = {
  organizationId: string;
  projectId?: string | null;
  kind: NotificationKind;
  title: string;
  /** Markdown. Keep it short: this is also the push body and the iMessage. */
  body: string;
  url?: string | null;
  moveId?: string | null;
};

async function create(input: NotificationInput): Promise<NotificationRow> {
  const [row] = await db
    .insert(customNotifications)
    .values({
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      kind: input.kind,
      title: input.title,
      body: input.body,
      url: input.url ?? null,
      moveId: input.moveId ?? null,
      createdAt: isoNow(),
    })
    .returning();
  if (!row) throw new Error("insert returned no row");
  return row;
}

async function listForOrganization(organizationId: string, limit = 50) {
  return db
    .select()
    .from(customNotifications)
    .where(eq(customNotifications.organizationId, organizationId))
    .orderBy(desc(customNotifications.createdAt))
    .limit(limit);
}

async function unreadCount(organizationId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(customNotifications)
    .where(
      and(
        eq(customNotifications.organizationId, organizationId),
        isNull(customNotifications.readAt),
      ),
    );
  return Number(row?.count ?? 0);
}

async function markRead(organizationId: string, id: string) {
  await db
    .update(customNotifications)
    .set({ readAt: isoNow() })
    .where(
      and(
        eq(customNotifications.id, id),
        eq(customNotifications.organizationId, organizationId),
      ),
    );
}

async function markAllRead(organizationId: string) {
  await db
    .update(customNotifications)
    .set({ readAt: isoNow() })
    .where(
      and(
        eq(customNotifications.organizationId, organizationId),
        isNull(customNotifications.readAt),
      ),
    );
}

async function recordDelivery(
  id: string,
  channel: "email" | "push" | "imessage",
) {
  const now = isoNow();
  const patch =
    channel === "email"
      ? { emailSentAt: now }
      : channel === "push"
        ? { pushSentAt: now }
        : { imessageSentAt: now };
  await db
    .update(customNotifications)
    .set(patch)
    .where(eq(customNotifications.id, id));
}

export const NotificationsRepository = {
  create,
  listForOrganization,
  unreadCount,
  markRead,
  markAllRead,
  recordDelivery,
};
