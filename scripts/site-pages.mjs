// HTML for the gallery and the project hubs. Plain HTML and CSS, no scripts: the pages are
// generated at build time from each project's project.json.

/** Who a link is for, in the order hubs list them. */
const AUDIENCES = [
  { id: 'public', label: 'For customers', note: 'Public pages anyone can open.' },
  { id: 'team', label: 'For the team', note: 'Tools for staff and day-to-day work.' },
  { id: 'admin', label: 'For admins', note: 'Settings and management.' },
  { id: 'developers', label: 'For developers', note: 'How it is built and how to extend it.' },
];

const escape = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const external = (href) => /^https?:\/\//.test(href);
const target = (href) => (external(href) ? ' target="_blank" rel="noreferrer"' : '');
const initials = (name) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

const STYLES = `
:root {
  --bg: #f6f6f4; --surface: #ffffff; --text: #18181b; --muted: #6b6b73; --border: #e4e4e0;
  --accent: #18181b; --accent-text: #ffffff; --chip: #efefec; --shadow: 0 1px 2px rgb(0 0 0 / 5%), 0 8px 24px rgb(0 0 0 / 6%);
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #111113; --surface: #1b1b1e; --text: #f2f2f3; --muted: #a0a0a8; --border: #2c2c31;
    --accent: #f2f2f3; --accent-text: #111113; --chip: #26262b; --shadow: 0 1px 2px rgb(0 0 0 / 40%);
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--text);
  font: 15px/1.5 Inter, system-ui, -apple-system, 'Segoe UI', sans-serif;
}
a { color: inherit; }
main { max-width: 1080px; margin: 0 auto; padding: 48px 16px 64px; }
.eyebrow { font-size: 12px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
h1 { margin: 6px 0 8px; font-size: clamp(26px, 4vw, 34px); letter-spacing: -.02em; line-height: 1.2; }
.lead { margin: 0 0 32px; max-width: 640px; color: var(--muted); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
.card {
  display: flex; flex-direction: column; overflow: hidden;
  border: 1px solid var(--border); border-radius: 16px; background: var(--surface); box-shadow: var(--shadow);
}
.thumb { text-decoration: none; aspect-ratio: 16 / 9; background: var(--chip); display: grid; place-items: center; overflow: hidden; }
.thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.thumb span { font-size: 40px; font-weight: 700; color: var(--muted); letter-spacing: -.02em; }
.body { display: flex; flex-direction: column; gap: 8px; padding: 18px 20px 20px; flex: 1; }
.body h2 { margin: 0; font-size: 18px; }
.body p { margin: 0; color: var(--muted); flex: 1; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.button {
  display: inline-flex; align-items: center; justify-content: center; min-height: 40px;
  padding: 8px 16px; border: 1px solid var(--border); border-radius: 999px;
  font-weight: 600; font-size: 14px; text-decoration: none; background: var(--surface);
}
.button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
.button:hover { filter: brightness(.96); }
.back { display: inline-block; margin-bottom: 20px; color: var(--muted); text-decoration: none; font-size: 14px; }
.back:hover { color: var(--text); }
section { margin-top: 32px; }
section h2 { margin: 0; font-size: 18px; }
section > p { margin: 2px 0 12px; color: var(--muted); font-size: 14px; }
.links { display: grid; gap: 10px; padding: 0; margin: 0; list-style: none; }
.links a {
  display: flex; flex-direction: column; gap: 2px; padding: 14px 16px;
  border: 1px solid var(--border); border-radius: 12px; background: var(--surface); text-decoration: none;
}
.links a:hover { border-color: var(--muted); }
.links strong { font-size: 15px; }
.links span { color: var(--muted); font-size: 14px; }
.links .where { font-size: 12px; color: var(--muted); word-break: break-all; }
footer { margin-top: 48px; color: var(--muted); font-size: 13px; }
`;

function page(title, description, content) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
<style>${STYLES}</style>
</head>
<body>
<main>
${content}
</main>
</body>
</html>
`;
}

/** The front page: a card per project, with its main page and its hub. */
export function renderGallery(projects, { repoUrl }) {
  const cards = projects
    .map(
      (project) => `<article class="card">
  <a class="thumb" href="${escape(project.hub)}" aria-hidden="true" tabindex="-1">${
    project.thumbnail
      ? `<img src="${escape(project.thumbnail)}" alt="" loading="lazy">`
      : `<span>${escape(initials(project.name))}</span>`
  }</a>
  <div class="body">
    <h2>${escape(project.name)}</h2>
    <p>${escape(project.summary)}</p>
    <div class="actions">
      <a class="button primary" href="${escape(project.open)}"${target(project.open)}>Open ${escape(project.links[0].label.toLowerCase())}</a>
      <a class="button" href="${escape(project.hub)}">Project hub</a>
    </div>
  </div>
</article>`,
    )
    .join('\n');
  return page(
    'VIRTUOS projects',
    'Every VIRTUOS project in one place.',
    `<div class="eyebrow">VIRTUOS</div>
<h1>Projects</h1>
<p class="lead">Every project in one place. Open a project directly, or go to its hub for all of its pages: public, team, admin and developer.</p>
<div class="grid">
${cards}
</div>
<footer>${projects.length} projects · <a href="${escape(repoUrl)}">Source on GitHub</a></footer>`,
  );
}

/** One project's hub: all its pages, grouped by who they are for. */
export function renderHub(project, { base }) {
  const sections = AUDIENCES.map((audience) => {
    const links = project.links.filter((link) => (link.audience ?? 'public') === audience.id);
    if (links.length === 0) return '';
    const items = links
      .map(
        (link) => `<li><a href="${escape(link.href)}"${target(link.href)}>
  <strong>${escape(link.label)}${external(link.href) ? ' ↗' : ''}</strong>
  ${link.description ? `<span>${escape(link.description)}</span>` : ''}
  <span class="where">${escape(link.href.replace(/^https?:\/\//, ''))}</span>
</a></li>`,
      )
      .join('\n');
    return `<section>
<h2>${escape(audience.label)}</h2>
<p>${escape(audience.note)}</p>
<ul class="links">
${items}
</ul>
</section>`;
  }).join('\n');

  return page(
    `${project.name} · VIRTUOS projects`,
    project.summary,
    `<a class="back" href="${escape(base)}">← All projects</a>
<div class="eyebrow">Project hub</div>
<h1>${escape(project.name)}</h1>
<p class="lead">${escape(project.summary)}</p>
<div class="actions">
  <a class="button primary" href="${escape(project.open)}"${target(project.open)}>Open ${escape(project.links[0].label.toLowerCase())}</a>
  <a class="button" href="${escape(project.source)}" target="_blank" rel="noreferrer">Source code ↗</a>
</div>
${sections}`,
  );
}
