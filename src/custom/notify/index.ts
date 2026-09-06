// One call stores the notification in the in-app inbox and fans it out to
// every transport the organization has turned on. Transports that are not
// configured are skipped silently; the inbox row is the source of truth.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { member, user } from "@/db/schema";
import { SettingsRepository } from "@/custom/settings/repository";
import { emailConfigured, sendEmail } from "./email";
import { imessageConfigured, sendImessage } from "./imessage";
import { NotificationsRepository, type NotificationInput } from "./inapp";
import { pushConfigured, sendPushToOrganization } from "./push";

type DeliveryReport = {
  notificationId: string;
  email: number;
  push: number;
  imessage: boolean;
};

async function recipientEmails(organizationId: string): Promise<string[]> {
  const rows = await db
    .select({ email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, organizationId));
  return [...new Set(rows.map((row) => row.email).filter(Boolean))];
}

/** Markdown → the plain text transports want. Good enough for our own
 *  short, list-shaped bodies. */
function plainText(markdown: string): string {
  return markdown
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1 ($2)")
    .replace(/^#+\s*/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .trim();
}

export async function notify(
  env: Cloudflare.Env,
  input: NotificationInput,
): Promise<DeliveryReport> {
  const row = await NotificationsRepository.create(input);
  const settings = await SettingsRepository.getOrg(input.organizationId);
  const url =
    input.url ??
    `${env.CUSTOM_APP_URL ?? ""}${input.moveId ? `/moves/${input.moveId}` : "/inbox"}`;
  const report: DeliveryReport = {
    notificationId: row.id,
    email: 0,
    push: 0,
    imessage: false,
  };

  if (settings.notifyEmail && emailConfigured(env)) {
    const recipients = await recipientEmails(input.organizationId);
    report.email = await sendEmail(env, recipients, {
      subject: input.title,
      headline: input.title,
      body: plainText(input.body),
      url,
    });
    if (report.email > 0)
      await NotificationsRepository.recordDelivery(row.id, "email");
  }

  if (settings.notifyPush && pushConfigured(env)) {
    report.push = await sendPushToOrganization(env, input.organizationId, {
      title: input.title,
      body: plainText(input.body).slice(0, 400),
      url,
      tag: input.kind,
    });
    if (report.push > 0)
      await NotificationsRepository.recordDelivery(row.id, "push");
  }

  if (
    settings.notifyImessage &&
    settings.imessageTo &&
    imessageConfigured(env)
  ) {
    report.imessage = await sendImessage(
      env,
      settings.imessageTo,
      `${input.title}\n\n${plainText(input.body)}\n\n${url}`,
    );
    if (report.imessage)
      await NotificationsRepository.recordDelivery(row.id, "imessage");
  }

  return report;
}
