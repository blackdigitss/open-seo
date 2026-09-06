import { createFileRoute } from "@tanstack/react-router";
import { MovesList } from "@/custom/client/moves/MovesList";

export const Route = createFileRoute("/_app/moves")({
  component: MovesPage,
});

function MovesPage() {
  return (
    <div className="h-full overflow-auto bg-base-100 px-4 py-6 pb-24 md:px-6 md:py-10 md:pb-10">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Moves</h1>
          <p className="mt-1 text-sm text-base-content/60">
            Every fix and opening across your sites, worth-most first.
          </p>
        </header>
        <MovesList />
      </div>
    </div>
  );
}
