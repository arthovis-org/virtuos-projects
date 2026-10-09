/**
 * The free AI behind the planner (plan.js) and the agents (agents.js): Groq (GPT-OSS 120B,
 * 1,000 requests a day free) when a GROQ_API_KEY secret is set, and Cloudflare Workers AI
 * (Llama 3.3 70B, a smaller free daily allowance) otherwise or once Groq's limit is reached.
 * Neither bills on its free plan: past the limits, requests fail until the next day.
 */

/** The Workers AI model; any Workers AI text model taking chat messages works. */
const DEFAULT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
/** The Groq model (OpenAI-style chat API). Groq retired Llama from free accounts (August 2026). */
const GROQ_MODEL = "openai/gpt-oss-120b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/** An AI that couldn't answer, and whether it was because of its free limits. */
export class AiError extends Error {
  constructor(message, limited) {
    super(message);
    this.limited = limited;
  }
}

/** Asks Groq; throws AiError (limited on 429: its per-minute or daily cap). */
async function askGroq(env, messages, { maxTokens, temperature }) {
  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.GROQ_MODEL || GROQ_MODEL,
      messages,
      // A reasoning model: a little thinking is enough here, and keeps it quick.
      reasoning_effort: "low",
      max_tokens: maxTokens,
      temperature,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new AiError(
      `Groq ${response.status}: ${detail.slice(0, 200)}`,
      response.status === 429,
    );
  }
  const data = await response.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

/** Asks Workers AI; throws AiError (limited once the daily allowance is used up). */
async function askWorkersAI(env, messages, { maxTokens, temperature }) {
  if (!env.AI) throw new AiError("Workers AI is not bound", false);
  try {
    const result = await env.AI.run(env.AI_MODEL || DEFAULT_MODEL, {
      messages,
      max_tokens: Math.min(maxTokens, 2048),
      temperature,
    });
    return typeof result?.response === "string" ? result.response : "";
  } catch (error) {
    const message = String(error?.message ?? error);
    throw new AiError(message, /limit|quota|neuron|4006|capacity/i.test(message));
  }
}

/** Whether any AI is set up. */
export const hasAi = (env) => !!(env.AI || env.GROQ_API_KEY);

/**
 * Asks the AI: Groq first when it is set up, Workers AI when it isn't or can't answer.
 * Returns { answer, via } with an empty answer when none could, and `limited` when that was
 * because of the free limits.
 */
export async function ask(env, messages, { maxTokens = 4096, temperature = 0.4 } = {}) {
  const services = [
    ...(env.GROQ_API_KEY ? [["groq", askGroq]] : []),
    ...(env.AI ? [["workers-ai", askWorkersAI]] : []),
  ];
  let limited = true;
  for (const [via, service] of services) {
    try {
      const answer = await service(env, messages, { maxTokens, temperature });
      if (answer.trim()) return { answer, via, limited: false };
    } catch (error) {
      console.error(error);
      limited &&= error instanceof AiError && error.limited;
    }
  }
  return { answer: "", via: "", limited };
}

/** A visitor's requests within a window, counted in this Worker instance only. */
export function rateLimiter({ max, windowMs }) {
  const seen = new Map();
  return (request) => {
    const visitor = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const now = Date.now();
    const recent = (seen.get(visitor) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) return false;
    recent.push(now);
    seen.set(visitor, recent);
    return true;
  };
}
