import { createFileRoute } from "@tanstack/react-router";
import { MovesList } from "@/custom/client/moves/MovesList";

export const Route = createFileRoute("/_project/p/$projectId/moves")({
  component: ProjectMovesPage,
});

function ProjectMovesPage() {
  const { projectId } = Route.useParams();
  return (
    <div className="h-full overflow-auto bg-base-100 px-4 py-6 pb-24 md:px-6 md:py-10 md:pb-10">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Moves</h1>
          <p className="mt-1 text-sm text-base-content/60">
            Fixes and openings for this site.
          </p>
        </header>
        <MovesList projectId={projectId} />
      </div>
    </div>
  );
}
