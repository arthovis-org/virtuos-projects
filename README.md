# VIRTUOS projects

Every VIRTUOS project in one repository, published together as one website:
**https://arthovis-org.github.io/virtuos-projects/**

| Project | Folder | Live |
| --- | --- | --- |
| Smart Desk configurator | [`apps/product-configurator`](apps/product-configurator) | [/product-configurator/](https://arthovis-org.github.io/virtuos-projects/product-configurator/) |
| Proto3D | [`apps/proto3d`](apps/proto3d) | [/proto3d/](https://arthovis-org.github.io/virtuos-projects/proto3d/) |

## Gallery and hubs

- The **gallery** is the front page of the site: one card per project, with a picture, a short
  description and two buttons, one to open the project and one to its hub.
- A **hub** is a project's own page of links: everything that belongs to the project, grouped
  by who it is for (customers, the team, admins, developers), with its source code. One place to
  find all of a project's screens and tools.

Both are generated: nobody edits them by hand. Each project has a `project.json` that says what it
is and lists its pages; the build reads them all.

## Layout

```
apps/<project>/          one folder per project, each with its own tools and dependencies
  project.json           name, summary, how it is published, its pages (for the gallery and hub)
  thumbnail.jpg          the gallery picture (optional; 16:9)
scripts/build-site.mjs   builds every project and generates the gallery and hubs into _site/
scripts/site-pages.mjs   the gallery and hub page templates
.github/workflows/       deploy.yml publishes the site; one checks workflow per project
```

Projects keep their own way of working: the configurator is built with Vite, Proto3D is plain
files published as they are. Each is published at `/<folder name>/`.

## Adding a project

1. Put it in `apps/<name>/` (lowercase, dashes): the folder name becomes its address.
2. Add `project.json`:

   ```json
   {
     "name": "Project name",
     "summary": "One or two sentences for the gallery card.",
     "order": 3,
     "site": { "build": "npm run build -- --base={base}", "output": "dist" },
     "links": [
       { "label": "Website", "path": "", "audience": "public", "description": "The public site." },
       { "label": "Staff desk", "path": "staff/", "audience": "team" },
       { "label": "Docs", "url": "https://…", "audience": "developers" }
     ]
   }
   ```

   - `site.build` builds the project for its address (`{base}` becomes `/virtuos-projects/<name>/`)
     and `site.output` is the folder it builds into. Without `build`, the folder is published as it
     is (`site.exclude` lists folders to leave out).
   - `links`: the first one is the project's main page. `path` is inside the project, `url` goes
     anywhere. `audience` is `public`, `team`, `admin` or `developers`.
3. If the project has a build step, add its install to `.github/workflows/deploy.yml`, and a
   checks workflow like the others if it has tests.
4. Optionally add `thumbnail.jpg` (16:9, about 1280 × 720).

Everything on GitHub Pages is public. Admin and staff pages that must stay private need a host
with logins (and a backend for real admin actions); the hub can still link to them.

## Working locally

```bash
npm run install:all   # each project's dependencies
npm run build         # the whole site into _site/
npm run serve         # http://127.0.0.1:4180/virtuos-projects/
```

Inside a project folder its own commands work as before, e.g. `npm run dev` in
`apps/product-configurator`.

## History

The projects came from `arthovis-org/ProductConfigurator` and `arthovis-org/Proto3D` with their
full history (`git log -- apps/proto3d`).
