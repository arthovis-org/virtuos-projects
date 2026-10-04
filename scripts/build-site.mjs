// Builds the whole public site into _site/:
//
//   _site/index.html            the gallery: one card per project
//   _site/hubs/<id>/index.html  each project's hub: all its pages, grouped by who they are for
//   _site/<id>/                 the project itself, built (or copied) for that address
//
// Every folder under apps/ with a project.json is a project; adding one adds it to the gallery.
// SITE_BASE is the address the site is served from (GitHub Pages: /virtuos-projects/).
//
//   node scripts/build-site.mjs              build every project, then the gallery and hubs
//   node scripts/build-site.mjs --pages-only only the gallery and hubs (projects already built)

import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderGallery, renderHub } from './site-pages.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appsDir = join(root, 'apps');
const out = join(root, '_site');
const base = (process.env.SITE_BASE ?? '/virtuos-projects/').replace(/\/?$/, '/');
const repoUrl = 'https://github.com/arthovis-org/virtuos-projects';
const pagesOnly = process.argv.includes('--pages-only');

/** Reads apps/<id>/project.json for every project, in gallery order. */
function loadProjects() {
  return readdirSync(appsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(appsDir, entry.name, 'project.json')))
    .map((entry) => {
      const dir = join(appsDir, entry.name);
      const project = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
      if (!project.name || !Array.isArray(project.links) || project.links.length === 0) {
        throw new Error(`apps/${entry.name}/project.json needs a "name" and at least one link`);
      }
      return { id: entry.name, dir, ...project };
    })
    .sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.name.localeCompare(b.name));
}

/** Builds or copies one project into _site/<id>/. */
function publishProject(project) {
  const target = join(out, project.id);
  const site = project.site ?? {};
  if (site.build) {
    const command = site.build.replaceAll('{base}', `${base}${project.id}/`);
    console.log(`\n▸ ${project.id}: ${command}`);
    execSync(command, { cwd: project.dir, stdio: 'inherit' });
    cpSync(join(project.dir, site.output ?? 'dist'), target, { recursive: true });
  } else {
    // A static project is published as it is, minus tooling folders.
    const exclude = new Set(site.exclude ?? ['node_modules']);
    console.log(`\n▸ ${project.id}: copying as it is`);
    cpSync(project.dir, target, {
      recursive: true,
      filter: (source) => {
        const path = relative(project.dir, source);
        return !path || !path.split(/[\\/]/).some((part) => exclude.has(part));
      },
    });
  }
}

/** Absolute address of a link, for the gallery and hubs. */
function linkHref(project, link) {
  return link.url ?? `${base}${project.id}/${link.path ?? ''}`;
}

const projects = loadProjects();
if (!pagesOnly) {
  rmSync(out, { recursive: true, force: true });
  for (const project of projects) publishProject(project);
}
mkdirSync(out, { recursive: true });

const view = projects.map((project) => ({
  id: project.id,
  name: project.name,
  summary: project.summary ?? '',
  hub: `${base}hubs/${project.id}/`,
  open: linkHref(project, project.links[0]),
  source: `${repoUrl}/tree/main/apps/${project.id}`,
  thumbnail: existsSync(join(project.dir, 'thumbnail.jpg')) ? `${base}hubs/${project.id}/thumbnail.jpg` : null,
  links: project.links.map((link) => ({ ...link, href: linkHref(project, link) })),
}));

writeFileSync(join(out, 'index.html'), renderGallery(view, { base, repoUrl }));
for (const project of view) {
  const hubDir = join(out, 'hubs', project.id);
  mkdirSync(hubDir, { recursive: true });
  writeFileSync(join(hubDir, 'index.html'), renderHub(project, { base, repoUrl }));
  const thumbnail = join(appsDir, project.id, 'thumbnail.jpg');
  if (existsSync(thumbnail)) cpSync(thumbnail, join(hubDir, 'thumbnail.jpg'));
}
// Pages serves files as they are (no Jekyll processing of folders such as _template).
writeFileSync(join(out, '.nojekyll'), '');
console.log(`\n✓ ${projects.length} projects, gallery and hubs in _site/ (base ${base})`);
