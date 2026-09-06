import { useQuery } from "@tanstack/react-query";
import { getMovesSettings } from "@/custom/serverFunctions/settings";
import { NotificationSettings } from "./NotificationSettings";
import { ProjectEconomics } from "./ProjectEconomics";

export function MovesSettings() {
  const settingsQuery = useQuery({
    queryKey: ["custom", "movesSettings"],
    queryFn: () => getMovesSettings(),
  });

  if (settingsQuery.isLoading || !settingsQuery.data) {
    return <div className="skeleton h-64 w-full" />;
  }

  const { org, projects } = settingsQuery.data;

  return (
    <div className="space-y-8">
      {/* Keyed so a save that returns new server state reseeds the form. */}
      <NotificationSettings key={org.updatedAt} initial={org} />
      {projects.length > 0 ? <ProjectEconomics rows={projects} /> : null}
    </div>
  );
}
