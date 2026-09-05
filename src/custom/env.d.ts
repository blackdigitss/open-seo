// Fork-owned bindings and vars. Merges into the global Env alongside
// src/env.d.ts without touching it.
declare namespace Cloudflare {
  interface Env {
    // Workers AI, bound only in the custom scheduled Worker; the LLM seam falls
    // back to it when no OpenRouter key is set.
    AI?: Ai;
    // OpenRouter model slug for drafts and plan prose (see src/custom/llm.ts).
    CUSTOM_LLM_MODEL?: string;
    // Workers AI model id used when OpenRouter is not configured.
    CUSTOM_AI_MODEL?: string;
    // Public origin of the app, for links in notifications.
    CUSTOM_APP_URL?: string;
    // Shared secret for the custom Worker's manual /run endpoint.
    CUSTOM_RUN_SECRET?: string;
    // "1" pauses every scheduled job.
    CUSTOM_JOBS_DISABLED?: string;

    // Loops transactional template for plans/events; auto-provisioned into KV
    // when unset and LOOPS_API_KEY exists.
    LOOPS_TRANSACTIONAL_BRIEFING_ID?: string;

    // Web Push (RFC 8292 VAPID). Public key is base64url of the raw P-256
    // point; private key is the JWK JSON.
    VAPID_PUBLIC_KEY?: string;
    VAPID_PRIVATE_JWK?: string;
    VAPID_SUBJECT?: string;

    // BlueBubbles iMessage server (optional transport).
    BLUEBUBBLES_URL?: string;
    BLUEBUBBLES_PASSWORD?: string;
  }
}
