# Feedback Worker

The sites are static (GitHub Pages), so feedback needs one small piece of backend. This
[Cloudflare Worker](https://developers.cloudflare.com/workers/) takes what visitors send with a
site's **Feedback** button and files it as an issue in the private repository
[`arthovis-org/virtuos-feedback`](https://github.com/arthovis-org/virtuos-feedback), labelled
`feedback` plus `bug`, `idea` or `other`. An attached picture is stored in that repository and
shown in the issue.

```
site's Feedback button  →  this Worker  →  issue in arthovis-org/virtuos-feedback
```

Each issue carries what is needed to reproduce: the exact page link (the configurator keeps its
whole state in the URL), the view the visitor was in, device and browser, and any recent errors
on the page.

## Reading feedback

```bash
gh issue list --repo arthovis-org/virtuos-feedback --label feedback
gh issue view <number> --repo arthovis-org/virtuos-feedback
```

## Setup (once)

1. A fine-grained GitHub token, owner `arthovis-org`, only the `virtuos-feedback` repository,
   with **Issues: Read and write** and **Contents: Read and write**.
2. In this folder:

   ```bash
   npx wrangler login
   npx wrangler secret put GITHUB_TOKEN
   npx wrangler deploy
   ```

   `deploy` prints the Worker's address (`https://virtuos-feedback.<account>.workers.dev`).
3. The site reads that address from `VITE_FEEDBACK_URL` (`apps/product-configurator/.env`);
   without it, the Feedback button is hidden.

When the token expires, create a new one and run `npx wrangler secret put GITHUB_TOKEN` again.

## Settings

`wrangler.toml`: `REPO` (where issues go) and `ALLOWED_ORIGINS` (sites that may send; add a
domain here if the sites move). Limits in `src/index.js`: messages up to 5000 characters,
pictures up to about 3 MB, 8 sends per visitor per 10 minutes, and a hidden form field that
quietly drops bots.

## Trying it locally

```bash
npx wrangler dev
```

serves the Worker at `http://localhost:8787/feedback`; point `VITE_FEEDBACK_URL` at it to test.
Issues it creates are real, so close them afterwards.
