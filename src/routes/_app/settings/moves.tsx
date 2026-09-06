import { createFileRoute } from "@tanstack/react-router";
import { MovesSettings } from "@/custom/client/settings/MovesSettings";

export const Route = createFileRoute("/_app/settings/moves")({
  component: MovesSettings,
});
