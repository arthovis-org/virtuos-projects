/**
 * AI agents at the configurator's desks: a team (each agent a name and a role) gets a goal,
 * splits it into tasks, and works them step by step; the page shows the work on the desks'
 * screens. Two requests, both answered by the free AI (ai.js):
 *
 *   POST /agents { action: "plan", goal, team: [{ id, name, role }] }
 *     -> 200 { summary, tasks: [{ id, agent, title, brief, dependsOn, steps: [{ kind, title, search? }] }] }
 *   POST /agents { action: "step", goal, agent, task, step, done?, context? }
 *     -> 200 { note, content, sources: [{ title, url }] }
 *
 * Research steps are grounded in real Wikipedia articles: the Worker searches Wikipedia for the
 * step's `search` terms, gives the AI their introductions, and returns them as `sources` (which
 * the agent opens on its screens), so no address is ever made up.
 *
 * As with /plan, the instructions are written here: the page only sends the goal and the team,
 * so this can't be used as a general chatbot.
 */
import { ask, hasAi, rateLimiter } from "./ai.js";

/** A whole team's run is a plan and a few steps per agent: about 20 requests. */
const allowAgents = rateLimiter({ max: 120, windowMs: 10 * 60 * 1000 });
const KINDS = ["research", "write", "design", "analyze", "review"];
const MAX_GOAL = 600;
const MAX_CONTEXT = 3500;

const text = (value, max) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
/** Text that keeps its lines (markdown). */
const block = (value, max) =>
  typeof value === "string" ? value.replace(/\r/g, "").trim().slice(0, max) : "";

function readTeam(input) {
  return (Array.isArray(input) ? input : [])
    .slice(0, 8)
    .map((a) => ({ id: text(a?.id, 40), name: text(a?.name, 30), role: text(a?.role, 80) }))
    .filter((a) => /^[\w-]+$/.test(a.id) && a.name && a.role);
}

/** The first JSON object in an answer (models sometimes wrap it in prose or code fences). */
function parseJson(answer) {
  const start = answer.indexOf("{");
  const end = answer.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(answer.slice(start, end + 1));
  } catch {
    return null;
  }
}

const planInstructions = (team) => `You lead a team of AI agents, each working at their own desk. Split the goal into tasks for the team.

The team:
${team.map((a) => `- ${a.id}: ${a.name}, ${a.role}`).join("\n")}

Answer with one JSON object only, no other text:
{
  "summary": "one sentence: how the team will reach the goal",
  "tasks": [
    {
      "id": "t1",
      "agent": "<an agent id from the team>",
      "title": "short task title (max 6 words)",
      "brief": "one or two sentences: what to deliver",
      "dependsOn": ["ids of tasks whose results this task needs"],
      "steps": [
        { "kind": "research", "title": "short step title (max 6 words)", "search": "2-4 words to look up on Wikipedia" },
        { "kind": "write", "title": "..." }
      ]
    }
  ]
}

Rules:
- Exactly one task per agent, matching their role. Every agent gets a task.
- 2 to 4 steps per task. Step kinds: research (look things up), write (texts), design (visual direction), analyze (numbers, tables), review (check others' work).
- A research step always has "search": plain words about a real, well-known topic that Wikipedia has an article on (e.g. "standing desk", "product launch", "Scandinavian design"). Other steps have no "search".
- The team works in parallel: most tasks start right away (empty dependsOn), each from its own angle (e.g. research the market, sketch the visual direction, draft a first message, estimate numbers). Only a task that truly needs another's result depends on it, typically a final task that brings the work together or reviews it. Never a chain of more than two tasks. No cycles.
- Prefer 3 steps per task.
- Write in the language of the goal.`;

const KIND_GUIDE = {
  research:
    "Summarise what matters for the task from the sources below, as short bullet points with the key facts, and end with 2-3 takeaways for the team. Mention which source a fact comes from.",
  write:
    "Write the finished text itself (headline, short paragraphs or bullets), ready to use. Not a description of what you would write.",
  design:
    'Give a concrete visual direction: a colour palette as a markdown list of 4-5 colours with hex codes (e.g. "- Ink #1C1C22: text"), 2-3 headline or layout options, and the mood in a few words.',
  analyze:
    "Give the analysis with numbers: at least one markdown table (3-6 rows), then 2-3 bullet points on what it means. Label estimates as estimates.",
  review:
    "Review the team's work below: a checklist of 4-6 points, each starting with ✅ or ⚠️, then a one-line verdict.",
};

const stepInstructions = (agent, kind) => `You are ${agent.name}, ${agent.role}, an AI agent working at your desk on one step of a team task. Your work is shown live on your screens.

Answer with one JSON object only, no other text:
{
  "note": "what you are doing, present tense, max 8 words (shown above your desk)",
  "content": "your work for this step, in markdown"
}

For this step: ${KIND_GUIDE[kind]}

Rules for "content":
- At most 220 words. Use ## headings, bullet points, **bold** and markdown tables where they help.
- Concrete and specific to the goal; no filler, no "as an AI".
- Never invent statistics as facts or links. Facts only from the sources given; otherwise say they are estimates.
- Write in the language of the goal.`;

/** Wikipedia's introductions to its articles best matching the terms (at most 2). */
async function wikipedia(search) {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: search,
    gsrlimit: "2",
    prop: "extracts|info",
    exintro: "1",
    explaintext: "1",
    exchars: "1200",
    inprop: "url",
  }).toString();
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "VIRTUOS-configurator/1.0 (https://arthovis-org.github.io)" },
    });
    if (!response.ok) return [];
    const data = await response.json();
    return Object.values(data?.query?.pages ?? {})
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((p) => ({ title: p.title, url: p.fullurl, extract: text(p.extract, 1200) }))
      .filter((p) => p.title && p.url?.startsWith("https://en.wikipedia.org/"));
  } catch {
    return [];
  }
}

async function planTeam(body, env, reply) {
  const goal = text(body.goal, MAX_GOAL);
  const team = readTeam(body.team);
  if (!goal) return reply(400, { error: "Give the team a goal first" });
  if (team.length === 0) return reply(400, { error: "No team to plan for" });

  const { answer, via, limited } = await ask(
    env,
    [
      { role: "system", content: planInstructions(team) },
      { role: "user", content: `The goal: ${goal}` },
    ],
    { maxTokens: 2500, temperature: 0.4 },
  );
  if (!answer) return failed(reply, limited);
  const parsed = parseJson(answer);
  const ids = new Set(team.map((a) => a.id));
  const tasks = (Array.isArray(parsed?.tasks) ? parsed.tasks : [])
    .slice(0, 12)
    .map((t, i) => ({
      id: text(t?.id, 20) || `t${i + 1}`,
      agent: text(t?.agent, 40),
      title: text(t?.title, 60),
      brief: text(t?.brief, 300),
      dependsOn: (Array.isArray(t?.dependsOn) ? t.dependsOn : []).map((d) => text(d, 20)),
      steps: (Array.isArray(t?.steps) ? t.steps : [])
        .slice(0, 4)
        .map((s) => ({
          kind: KINDS.includes(s?.kind) ? s.kind : "write",
          title: text(s?.title, 60) || "Work",
          ...(s?.kind === "research" && text(s?.search, 60) && { search: text(s.search, 60) }),
        })),
    }))
    .filter((t) => ids.has(t.agent) && t.title && t.steps.length > 0);
  if (tasks.length === 0) {
    return reply(502, { error: "The AI's plan could not be read; try again" });
  }
  // Only dependencies on tasks that exist, and no task waiting on itself.
  const known = new Set(tasks.map((t) => t.id));
  for (const t of tasks) t.dependsOn = t.dependsOn.filter((d) => known.has(d) && d !== t.id);
  return reply(200, { summary: text(parsed?.summary, 300), tasks, via });
}

async function workStep(body, env, reply) {
  const goal = text(body.goal, MAX_GOAL);
  const agent = readTeam([body.agent])[0];
  const task = { title: text(body.task?.title, 60), brief: text(body.task?.brief, 300) };
  const kind = KINDS.includes(body.step?.kind) ? body.step.kind : "write";
  const step = { title: text(body.step?.title, 60), search: text(body.step?.search, 60) };
  if (!goal || !agent || !task.title || !step.title) {
    return reply(400, { error: "Missing goal, agent, task or step" });
  }
  const sources = kind === "research" && step.search ? await wikipedia(step.search) : [];
  // What this agent did in earlier steps, and what teammates delivered that this task needs.
  const done = block(body.done, 2000);
  const context = (Array.isArray(body.context) ? body.context : [])
    .slice(0, 6)
    .map((c) => `From ${text(c?.from, 40)} (${text(c?.title, 60)}):\n${block(c?.content, 1200)}`)
    .join("\n\n")
    .slice(0, MAX_CONTEXT);

  const user = [
    `Team goal: ${goal}`,
    `Your task: ${task.title}. ${task.brief}`,
    `This step: ${step.title} (${kind})`,
    done && `Your earlier steps:\n${done}`,
    context && `Your teammates' work you build on:\n${context}`,
    sources.length > 0 &&
      `Sources (Wikipedia):\n${sources.map((s) => `[${s.title}] ${s.extract}`).join("\n\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const { answer, via, limited } = await ask(
    env,
    [
      { role: "system", content: stepInstructions(agent, kind) },
      { role: "user", content: user },
    ],
    { maxTokens: 1800, temperature: 0.6 },
  );
  if (!answer) return failed(reply, limited);
  const parsed = parseJson(answer);
  // A model that answered in plain markdown instead of JSON: use it as the content.
  const content = block(parsed?.content ?? (parsed ? "" : answer), 4000);
  if (!content) return reply(502, { error: "The AI's work could not be read; try again" });
  return reply(200, {
    note: text(parsed?.note, 60) || step.title,
    content,
    sources: sources.map(({ title, url }) => ({ title, url })),
    via,
  });
}

function failed(reply, limited) {
  return limited
    ? reply(429, {
        error: "The free AI has used up its allowance for now. Try again in a minute, or tomorrow.",
      })
    : reply(502, { error: "The AI could not answer; try again" });
}

export async function agents(request, env, reply) {
  if (!hasAi(env)) return reply(503, { error: "The AI is not set up on this site" });
  if (!allowAgents(request)) {
    return reply(429, { error: "The team is working fast; give it a few minutes" });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return reply(400, { error: "Expected JSON" });
  }
  if (body?.action === "plan") return planTeam(body, env, reply);
  if (body?.action === "step") return workStep(body, env, reply);
  return reply(400, { error: "Unknown action" });
}
