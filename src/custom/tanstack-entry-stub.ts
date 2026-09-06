// The custom Worker reaches upstream services (GSC, project context, audits)
// that transitively import @tanstack/start-server-core. Its createStartHandler
// dynamically imports the router/start entry points, which only a TanStack
// Start build provides — and which this Worker never runs, since it has no
// request router of its own.
//
// wrangler.custom.jsonc aliases those specifiers here so the bundle resolves.
// If anything ever does reach them, it fails loudly instead of silently
// serving nothing.
function unavailable(): never {
  throw new Error(
    "TanStack Start entry is not available in the custom scheduled worker — it has no router. Move whatever needed it into the app worker.",
  );
}

export default unavailable;
export const createRouter = unavailable;
export const getRouterManifest = unavailable;
