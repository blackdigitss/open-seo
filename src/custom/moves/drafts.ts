// Every Move ships with something the owner can paste. The LLM writes it in
// the project's voice when one is configured; the template fallback is always
// good enough to act on, so a missing key never produces an empty Move.
import { generateJson } from "@/custom/llm";
import { pathOf } from "./producers/types";

const SYSTEM = [
  "You write SEO copy for small local service businesses.",
  "Match the business's own voice. Be concrete and plain.",
  "Titles: 50-60 characters, lead with what the customer searches for.",
  "Meta descriptions: 140-160 characters, one clear benefit and a reason to click.",
  "Never invent prices, awards, review counts, certifications, or service areas.",
].join(" ");

type TitleAndMeta = {
  title: string;
  metaDescription: string;
  paragraph: string;
};

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

function templateTitleAndMeta(input: {
  query: string;
  businessName: string;
  url: string;
}): TitleAndMeta {
  const subject = titleCase(input.query);
  return {
    title: truncate(`${subject} | ${input.businessName}`, 60),
    metaDescription: truncate(
      `${subject} from ${input.businessName}. See what's included, how it works, and how to get in touch.`,
      160,
    ),
    paragraph: `Add a short section to ${pathOf(input.url)} that answers "${input.query}" directly in the first sentence, then covers what's included and what it costs to get started.`,
  };
}

/** Proposed title/meta/paragraph for a page targeting `query`. */
export async function draftTitleAndMeta(
  env: Cloudflare.Env,
  input: {
    query: string;
    url: string;
    businessName: string;
    voice: string;
    currentTitle?: string | null;
  },
): Promise<TitleAndMeta> {
  const fallback = templateTitleAndMeta(input);
  const generated = await generateJson<Partial<TitleAndMeta>>(env, {
    system: SYSTEM,
    prompt: [
      `Business: ${input.businessName}`,
      input.voice ? `Voice and context:\n${input.voice}` : "",
      `Page: ${input.url}`,
      input.currentTitle ? `Current title: ${input.currentTitle}` : "",
      `Target search: "${input.query}"`,
      "",
      'Return {"title": string, "metaDescription": string, "paragraph": string} where paragraph is 2-3 sentences to add to the page that answer the search directly.',
    ]
      .filter(Boolean)
      .join("\n"),
    maxTokens: 500,
  });

  return {
    title: generated?.title?.trim() || fallback.title,
    metaDescription:
      generated?.metaDescription?.trim() || fallback.metaDescription,
    paragraph: generated?.paragraph?.trim() || fallback.paragraph,
  };
}

/** Three concrete things to change on a page that is losing clicks. */
export async function draftRefreshNotes(
  env: Cloudflare.Env,
  input: {
    url: string;
    businessName: string;
    voice: string;
    queries: string[];
  },
): Promise<string> {
  const fallback = [
    `- Update anything dated on ${pathOf(input.url)} — years, prices, availability.`,
    `- Answer the questions people actually search for${input.queries.length ? `: ${input.queries.slice(0, 3).join(", ")}` : ""} in the first screen.`,
    "- Add or refresh one section a competitor covers and this page doesn't.",
  ].join("\n");

  const generated = await generateJson<{ notes?: string[] }>(env, {
    system: SYSTEM,
    prompt: [
      `Business: ${input.businessName}`,
      input.voice ? `Voice and context:\n${input.voice}` : "",
      `Page losing search clicks: ${input.url}`,
      input.queries.length
        ? `Searches it ranks for: ${input.queries.slice(0, 8).join(", ")}`
        : "",
      "",
      'Return {"notes": [three short, specific things to change on this page]}.',
    ]
      .filter(Boolean)
      .join("\n"),
    maxTokens: 400,
  });

  const notes = generated?.notes?.filter(
    (n) => typeof n === "string" && n.trim(),
  );
  return notes && notes.length > 0
    ? notes.map((n) => `- ${n.trim()}`).join("\n")
    : fallback;
}
