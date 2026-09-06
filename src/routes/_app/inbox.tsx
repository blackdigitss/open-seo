import { createFileRoute } from "@tanstack/react-router";
import { InboxPage } from "@/custom/client/inbox/InboxPage";

export const Route = createFileRoute("/_app/inbox")({
  component: InboxPage,
});
