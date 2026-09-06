import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";
import { NotificationsRepository } from "@/custom/notify/inapp";

export const listNotifications = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) =>
    NotificationsRepository.listForOrganization(context.organizationId, 50),
  );

export const getUnreadCount = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => ({
    unread: await NotificationsRepository.unreadCount(context.organizationId),
  }));

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    await NotificationsRepository.markRead(context.organizationId, data.id);
    return { ok: true };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => {
    await NotificationsRepository.markAllRead(context.organizationId);
    return { ok: true };
  });
