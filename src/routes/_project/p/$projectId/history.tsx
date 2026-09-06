import { createFileRoute } from "@tanstack/react-router";
import { HistoryPage } from "@/custom/client/history/HistoryPage";

export const Route = createFileRoute("/_project/p/$projectId/history")({
  component: ProjectHistoryPage,
});

function ProjectHistoryPage() {
  const { projectId } = Route.useParams();
  return <HistoryPage projectId={projectId} />;
}
