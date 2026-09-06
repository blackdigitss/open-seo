// Email through Loops, which the app already integrates in hosted mode. The
// transactional template is provisioned by API the first time a key exists,
// so the only thing the owner ever supplies is LOOPS_API_KEY.
const LOOPS_API = "https://app.loops.so/api/v1";
const KV_TEMPLATE_KEY = "custom:loops_briefing_template_id";
const TEMPLATE_NAME = "OpenSEO plan";

type EmailMessage = {
  subject: string;
  headline: string;
  /** Plain text with line breaks; the template renders it verbatim. */
  body: string;
  url: string;
};

function headers(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

async function loops<T>(
  apiKey: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${LOOPS_API}${path}`, {
    method,
    headers: headers(apiKey),
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Loops ${method} ${path} → ${response.status} ${text}`);
  }
  return (await response.json()) as T;
}

// LMX is Loops' email markup; data variables interpolate as {name}.
const TEMPLATE_LMX = [
  "<Heading>{headline}</Heading>",
  "<Paragraph>{body}</Paragraph>",
  '<Button href="{url}">Open in OpenSEO</Button>',
  "<Paragraph>You get this because OpenSEO found something worth your attention. Notification settings live in the app.</Paragraph>",
].join("\n");

/** Returns the transactional template id, creating and publishing one when
 *  none is configured. Null when there is no API key or provisioning failed
 *  (logged) — email is then skipped and the in-app inbox still has the row. */
async function ensureBriefingTemplate(
  env: Cloudflare.Env,
): Promise<string | null> {
  const apiKey = env.LOOPS_API_KEY?.trim();
  if (!apiKey) return null;
  if (env.LOOPS_TRANSACTIONAL_BRIEFING_ID?.trim()) {
    return env.LOOPS_TRANSACTIONAL_BRIEFING_ID.trim();
  }
  const cached = await env.KV.get(KV_TEMPLATE_KEY);
  if (cached) return cached;

  try {
    const created = await loops<{
      id?: string;
      transactionalId?: string;
      draftEmailMessageId?: string;
      draftEmailMessageContentRevisionId?: string;
    }>(apiKey, "POST", "/transactional-emails", { name: TEMPLATE_NAME });
    const transactionalId = created.transactionalId ?? created.id;
    if (!transactionalId || !created.draftEmailMessageId) {
      throw new Error(`unexpected create response ${JSON.stringify(created)}`);
    }
    await loops(
      apiKey,
      "POST",
      `/email-messages/${created.draftEmailMessageId}`,
      {
        expectedRevisionId: created.draftEmailMessageContentRevisionId,
        subject: "{subject}",
        previewText: "{headline}",
        fromName: "OpenSEO",
        emailFormat: "plain",
        lmx: TEMPLATE_LMX,
        dataVariablesFallbacks: {
          subject: "OpenSEO",
          headline: "OpenSEO",
          body: "",
          url: env.CUSTOM_APP_URL ?? "",
        },
      },
    );
    await loops(
      apiKey,
      "POST",
      `/transactional-emails/${transactionalId}/publish`,
    );
    await env.KV.put(KV_TEMPLATE_KEY, transactionalId);
    console.log("[custom:email] provisioned Loops template", transactionalId);
    return transactionalId;
  } catch (error) {
    console.error(
      "[custom:email] could not provision the Loops template; set LOOPS_TRANSACTIONAL_BRIEFING_ID to one created in the Loops dashboard with data variables subject, headline, body, url",
      error,
    );
    return null;
  }
}

export function emailConfigured(env: Cloudflare.Env): boolean {
  return Boolean(env.LOOPS_API_KEY?.trim());
}

/** Sends to each recipient; returns how many succeeded. */
export async function sendEmail(
  env: Cloudflare.Env,
  recipients: string[],
  message: EmailMessage,
): Promise<number> {
  const apiKey = env.LOOPS_API_KEY?.trim();
  if (!apiKey || recipients.length === 0) return 0;
  const transactionalId = await ensureBriefingTemplate(env);
  if (!transactionalId) return 0;

  let sent = 0;
  for (const email of recipients) {
    try {
      await loops(apiKey, "POST", "/transactional", {
        transactionalId,
        email,
        addToAudience: false,
        dataVariables: {
          subject: message.subject,
          headline: message.headline,
          body: message.body,
          url: message.url,
        },
      });
      sent += 1;
    } catch (error) {
      console.error("[custom:email] send failed", email, error);
    }
  }
  return sent;
}
