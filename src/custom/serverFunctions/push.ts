import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customPushSubscriptions } from "@/db/custom/schema";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";
import { NotificationsRepository } from "@/custom/notify/inapp";
import { isoNow } from "@/custom/lib/time";
import { KV_APP_URL, KV_VAPID_PUBLIC_KEY } from "@/custom/jobs/config-sync";

/** The public VAPID key, published into KV by the custom Worker so the app
 *  never needs its own copy of that Worker's config. */
export const getPushConfig = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async () => {
    const [publicKey, appUrl] = await Promise.all([
      env.KV.get(KV_VAPID_PUBLIC_KEY),
      env.KV.get(KV_APP_URL),
    ]);
    return { publicKey, appUrl };
  });

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
  userAgent: z.string().max(500).optional(),
});

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(subscriptionSchema)
  .handler(async ({ data, context }) => {
    await db
      .insert(customPushSubscriptions)
      .values({
        id: crypto.randomUUID(),
        organizationId: context.organizationId,
        userId: context.userId,
        endpoint: data.endpoint,
        p256dh: data.keys.p256dh,
        auth: data.keys.auth,
        userAgent: data.userAgent ?? null,
        createdAt: isoNow(),
      })
      .onConflictDoUpdate({
        target: customPushSubscriptions.endpoint,
        set: {
          organizationId: context.organizationId,
          userId: context.userId,
          p256dh: data.keys.p256dh,
          auth: data.keys.auth,
          failedAt: null,
        },
      });
    return { ok: true };
  });

export const removePushSubscription = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ endpoint: z.string().url().max(2000) }))
  .handler(async ({ data }) => {
    await db
      .delete(customPushSubscriptions)
      .where(eq(customPushSubscriptions.endpoint, data.endpoint));
    return { ok: true };
  });

/** Unread count for the mobile tab bar's badge. */
export const getInboxBadge = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => ({
    unread: await NotificationsRepository.unreadCount(context.organizationId),
  }));
