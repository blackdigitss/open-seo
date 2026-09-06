import { createFileRoute } from "@tanstack/react-router";
import { MoveDetail } from "@/custom/client/moves/MoveDetail";

export const Route = createFileRoute("/_app/moves/$moveId")({
  component: MoveDetailPage,
});

function MoveDetailPage() {
  const { moveId } = Route.useParams();
  return (
    <div className="h-full overflow-auto bg-base-100 px-4 py-6 pb-24 md:px-6 md:py-10 md:pb-10">
      <div className="mx-auto w-full max-w-2xl">
        <MoveDetail moveId={moveId} />
      </div>
    </div>
  );
}
