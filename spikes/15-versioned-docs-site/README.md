# Spike 15: A versioned, Laravel-style docs site

**Date:** 2026-11-14. **Environment:** Windows 11, Node v24.21.0, npm 11.19.0, Astro 7.4.11, Starlight 0.43.0, Pagefind 1.6.0 (bundled by Starlight).

```bash
cd spikes/15-versioned-docs-site
npm install
npm run dev                      # live preview of the current version: http://localhost:4321/strutvane-docs/docs/0.2.x/introduction/
npm run dev -- --version 0.1.x   # live preview of another version
npm run build                    # every version → dist/ (one Astro build per version, then merged)
npm run preview                  # serve dist/ like GitHub Pages: http://localhost:4321/strutvane-docs/
npm run verify                   # build + link check (all versions) + type check + 56 tests
```

`npm run dev` shows one version with hot reload. Search, redirects and the other versions need the merged site: `npm run build && npm run preview`.

## Question

What should Strutvane's new docs site be, so that it works like Laravel's docs (chronological menu, one docs branch per version, `/docs/{version}/{page}`, version switcher, "old version" banner, search, "Copy as Markdown"), deploys to GitHub Pages, and follows the versioning design (ADR-0020, `versions.json`)?

## Answer

**Starlight, built once per version (per branch), merged into one static site.** The prototype builds 0.2.x (current, 96 pages, with real content for the getting-started path) and 0.1.x (end of life, 8 pages imported from the old site) into one GitHub Pages-ready `dist/`. Every internal link in both versions is checked (12,500+ links, 304 HTML pages, including switcher targets and redirects), and 56 tests pass.

### What Laravel's docs do (studied 2026-11-14)

- **Menu in learning order** from one file per branch (`documentation.md` on `laravel/docs`): Prologue → Getting Started → Architecture Concepts → The Basics → Digging Deeper → Security → Database → Eloquent ORM → AI → Testing → Packages.
- **One docs branch per version** (`12.x`, `13.x`, `master`). Contributions go to the branch of the version they describe; the next release's docs go to `master`.
- **URLs** `/docs/{branch}/{page}`. Since 2026, laravel.com serves them at `/framework/docs/{branch}/{page}` (301 from the old path), and the unversioned `/docs/{page}` is the current version.
- **Old versions** show "WARNING You're browsing the documentation for an old version of Laravel. Consider upgrading your project to Laravel 13.x", linking to the same page.
- Search, "On this page", "Copy as markdown", and an agent playbook (`/for/agents`).
- **Lesson:** the support table is copied into each branch's `releases.md`, and `master` still showed the 12.x table on 2026-11-14 (versioning design §1.1). We render ours from `versions.json` in every build instead.

### Stack choice

| Option | Versioning model | Search | Fit |
|---|---|---|---|
| **Starlight, one build per branch, merged** (chosen) | Each version is its own Astro build at `/docs/{branch}/`, from its branch's content | Pagefind per version, so results are always from the version you're reading | Matches Laravel's branch model and ADR-0020 §10. Old versions never have to build with today's site code. Reuses the existing Starlight site, theme and know-how. |
| Starlight + `starlight-versions` 0.10.2 | Snapshot folders in one build; current version unversioned | One shared index | Every version must build with today's toolchain forever; URLs don't follow branch names. (Rejected by ADR-0020 too.) |
| Docusaurus versioned docs | `versioned_docs/version-x` snapshots | Algolia by default; local search via a plugin | Same snapshot model, React/MDX rewrite of the existing site, heavier. |
| VitePress | None built in | MiniSearch, not Pagefind | Would need the same per-build merge, plus a Vue rewrite. |

Starlight already gives: dark mode, friendly typography, "On this page", Expressive Code (copy buttons on every code block), tabs (synced across the page, used for macOS/Linux vs Windows, never for package managers: npm only), accessible navigation, sitemap, and Pagefind.

### URL scheme

| URL | What it is |
|---|---|
| `/strutvane-docs/docs/0.2.x/installation/` | A page of one version (the segment is the branch name) |
| `/strutvane-docs/docs/0.2.x/installation.md` | The same page as clean Markdown ("Copy as Markdown") |
| `/strutvane-docs/docs/0.2.x/llms.txt`, `llms-full.txt` | Per-version index and full text for AI tools |
| `/strutvane-docs/docs/latest/{page}/` | Redirect to the current line (stable links for READMEs) |
| `/strutvane-docs/docs/{page}/` | Redirect to the current line (like Laravel's unversioned URLs) |
| `/strutvane-docs/`, `/strutvane-docs/docs/` | Redirect to the current line's Introduction |
| `/strutvane-docs/docs/main/…` | Previews of the next line (supported; enable by adding `main` to `docs.sources.ts`) |
| `/strutvane-docs/versions.json` | The support table, for tools (`node strut about`, the installer) |

On a custom domain, build with `DOCS_SITE=https://strutvane.dev DOCS_BASE=/` and every URL loses the `/strutvane-docs` prefix; nothing else changes. GitHub Pages can't send HTTP redirects, so each redirect is a tiny HTML page (JavaScript `location.replace` keeps `#anchors`, `<meta refresh>` as fallback, `noindex` + canonical), and the site-wide `404.html` rescues `/docs/latest/…` links to pages added later.

### How versions map to code branches

- **`versions.json`** (the ADR-0020 support table, on `main`) decides which lines exist, which is current, and each line's status. It drives the switcher labels, the banners and the support table on every version's Release Notes page.
- **`docs.sources.ts`** says where each branch's Markdown is read from. Here they are folders (`versions/0.2.x`, `versions/0.1.x`). In the real `strutvane-docs` repo (laid out like `laravel/docs`), each line has a branch (`0.2.x`, `0.1.x`, `main`) with its pages in `content/`, and released lines are read with `{ git: { ref: 'origin/0.2.x', path: 'content' } }` (`git ls-tree` + `git show`, no checkout; tested against a real temporary repo).
- **Each version's own `navigation.json`** (our `documentation.md`) lives next to its pages, so each version keeps its own menu.
- **Edit this page** points at the file on that version's branch (`strutvane-docs/edit/0.2.x/content/installation.mdx`). End-of-life versions are frozen and have no edit link.
- **Build contract for a branch:** `DOCS_VERSION=0.2.x DOCS_MANIFEST=manifest.json astro build`. The manifest (every version's page list + the support table) is computed once on `main` and handed to each branch build, because a branch can't see the others. That is exactly what `npm run build` does locally.

### What the reader gets

- **Version switcher** at the top of the menu. Each option is a real URL computed at build time: the same page in the other version, or that version's home when the page doesn't exist there. The `#anchor` is kept only when the page is the same. Every target is link-checked.
- **Banners:** end of life ("You're reading the docs for Strutvane 0.1, which has reached end of life… Read this page for Strutvane 0.2"), security-only lines, `main` previews, and a "0.2 is still being built" note while the current line has no release date.
- **Canonical links** point at the current version's copy of a page, so search engines prefer current docs.
- **Search** scoped to the version you're reading (one Pagefind index per version; checked: every page is indexed).
- **Copy as Markdown**, View as Markdown and `llms.txt` on every page. MDX components become plain Markdown (tabs → bold labels, asides → quotes, link cards → lists, `<SupportTable />` → a table) and relative links become absolute.

### Content

- **0.2.x, real pages** (written from the v2 blueprint, spike 10, the spike 11/12/13 notes in SHARED-DESIGN and the research drafts; anything not built is marked "Coming in 0.2"): Introduction, Installation (questions, automatic steps, with/without Docker, recovery, exit codes, `--yes`, Windows notes), Configuration, Directory Structure, Your First CRUD in 5 Minutes, Migrations, Seeding, Release Notes (versioning scheme, support policy, live support table; from the drafted page), Upgrade Guide 0.1 → 0.2 (Laravel's format with likelihood of impact; from the drafted template).
- **0.2.x, "being written" pages:** every other menu entry, including all 28 first-party packages and the CLI reference, each with an accurate 2–3 line summary.
- **0.1.x:** What is Strutvane?, Quick start, Project structure, Environment variables, Models and fields, Migrations and CLI commands, copied from `packages/docs` with links flattened, plus a short Release Notes page with the live support table.

## Layout

| Path | What it is |
|---|---|
| `versions.json` | The support table (ADR-0020 format) |
| `docs.sources.ts` | Site title, repositories, and where each branch's content comes from |
| `versions/<branch>/` | Content of one version: `navigation.json` + pages (`.md`/`.mdx`) |
| `astro.config.ts`, `src/content.config.ts` | One Starlight site, parameterised by `DOCS_VERSION` |
| `src/components/` | Overrides: `Sidebar` (+ `VersionSwitcher`), `Banner`, `PageTitle` (Copy as Markdown), plus `SupportTable` for MDX |
| `src/pages/` | Endpoints: `[...slug].md`, `llms.txt`, `llms-full.txt` |
| `src/route-middleware.ts` | Per-version edit links and canonical URLs |
| `scripts/lib/` | Pure, tested logic: versions, navigation, site context, redirects, Markdown export, link checker, git sources |
| `scripts/{build,dev,preview,check-links}.ts` | The npm scripts |
| `test/` | `node:test` unit tests, plus `site.test.ts` on the built output |

## Releasing a new docs version (the workflow this enables)

1. In `strutvane-docs`, create branch `0.3.x` from `main` when 0.3.0 ships (as the framework does).
2. On `main`, add the `0.3` line to `versions.json` and set `current: "0.3"`; mark `0.2` as `security`.
3. Add `'0.3.x': { git: { ref: 'origin/0.3.x', path: 'content' } }` to `docs.sources.ts`.
4. The site workflow builds every line with a source, plus `main`, and deploys `dist/` to GitHub Pages. 0.2.x pages now show the "security fixes only" banner, and `/docs/latest/…` points at 0.3.x.

## Findings

1. **Per-branch builds are cheap.** The whole two-version build (96 + 9 pages) took 46–71 s on this laptop, most of it Astro start-up per version, so a nightly matrix of two lines plus `main` stays around two minutes.
2. **Search scoping comes for free.** Building each version under its own base gives each its own Pagefind index; no filter UI is needed.
3. **Astro 7's glob loader needs a `file:` URL** for an absolute content folder on Windows (a plain `C:\…` path fails with "The URL must be of scheme file").
4. **Content outside `src/content/docs` needs `markdown.processedDirs`**, or Starlight's asides and heading anchors silently don't apply.
5. **Inline redirect scripts need `<` escaping.** `JSON.stringify` doesn't escape `</script>`; the test suite caught it, and the fix (`\u003c`) has a regression test.
6. **Cross-version links must go through `/docs/latest/`** (or be relative). The 0.1.x Release Notes link to the upgrade guide via `../../latest/upgrade/`, so a frozen version never hard-codes the current one.
7. **Frozen end-of-life builds** bake in the switcher as it was when they were built. If that matters, a later step can refresh the switcher from `/versions.json` at runtime.

## Not done (next steps)

- GitHub Actions workflow (matrix over `versions.json`, deploy to Pages). Not deployed, as asked.
- Error-code pages (`/docs/errors/<code>`) and a Laravel → Strutvane cheat sheet (requested in SHARED-DESIGN).
- A runtime refresh of the switcher on frozen end-of-life builds (Finding 7).
- Starlight warns that the optional `i18n` collection is empty. That's harmless.
