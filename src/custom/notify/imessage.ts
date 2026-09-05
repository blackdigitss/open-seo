// iMessage through a BlueBubbles server (the owner has one installed). Optional:
// needs the server running with a public tunnel URL and its password. Silent
// no-op otherwise.
export function imessageConfigured(env: Cloudflare.Env): boolean {
  return Boolean(
    env.BLUEBUBBLES_URL?.trim() && env.BLUEBUBBLES_PASSWORD?.trim(),
  );
}

export async function sendImessage(
  env: Cloudflare.Env,
  to: string,
  text: string,
): Promise<boolean> {
  if (!imessageConfigured(env) || !to.trim()) return false;
  const base = env.BLUEBUBBLES_URL!.trim().replace(/\/$/, "");
  const url = `${base}/api/v1/message/text?password=${encodeURIComponent(env.BLUEBUBBLES_PASSWORD!.trim())}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatGuid: `iMessage;-;${to.trim()}`,
        tempGuid: crypto.randomUUID(),
        message: text,
        method: "apple-script",
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      console.error("[custom:imessage] send failed", response.status);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[custom:imessage] error", error);
    return false;
  }
}
