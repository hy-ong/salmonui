---
title: Agent Skills
description: One generated Agent Skill per Salmon UI component family, installed with npx skills add, so coding agents use the current imports, mental model, API and common mistakes instead of memory.
category: Tooling
order: 90
---

Coding agents such as Claude Code, Codex or Cursor load an Agent Skill (a
folder with a `SKILL.md`) when a task matches its description. Salmon UI
publishes one skill per component family, so an agent writing Salmon UI
code reads the current import lines, the mental model, the public API and
the common mistakes of that family, and then the linked docs pages, instead
of relying on what it remembers.

## Install

The site publishes every skill at `/skills/salmonui-<family>/SKILL.md`
and lists them in the well-known discovery index
`/.well-known/agent-skills/index.json`, the format the `skills` CLI reads.

```sh
# Every Salmon UI skill, picked from the site's discovery index
npx skills add https://salmonui.dev

# One skill, from its SKILL.md URL
npx skills add https://salmonui.dev/skills/salmonui-data-grid/SKILL.md
```

Without the CLI, copy a skill folder into the agent's skills folder, for
example `.claude/skills/salmonui-data-grid/SKILL.md` for Claude Code in a
project, or `~/.claude/skills/` for every project.

In a clone of the repository, `npm run skills:build` writes the same files
to the git-ignored `skills/` folder at the repository root; `--site-url`
sets the base URL of their links (default `SITE_URL`, then
`https://salmonui.dev`).

## Skills

There is one skill per component family, named `salmonui-<family>`: for
example `salmonui-button`, `salmonui-menu`, `salmonui-select`,
`salmonui-date-picker` and `salmonui-data-grid`. A family's further
subpaths join its skill (`@salmonui/data-grid/features` and
`@salmonui/data-grid/server` join `salmonui-data-grid`,
`@salmonui/charts/server` joins `salmonui-chart`, the pivot engine
`@salmonui/pivot-table/engine` joins `salmonui-pivot-table`). Four
package-level skills cover the packages that are not component families:
`salmonui-core` (theme, server theme styles, formatting, validation and the
shared data types), `salmonui-data`, `salmonui-export` and
`salmonui-data-grid-engine` (`@salmonui/data-grid/engine` and its
subpaths). A new family gets its skill with no extra work.

Each `SKILL.md` has YAML front matter with its `name` and a one-line
`description` (what the family is and when to use the skill), then:

| Section | Content |
| --- | --- |
| Import | `npm install @salmonui/<package>`, the import lines of the family's main components, `import '@salmonui/core/styles.css'; // once per app` and the family's `styles.css` from the package `exports`, and a reminder that every `@salmonui/*` package of an app must be the same version |
| Mental model | The main components with their reference summaries, and the opening paragraph of the family's main docs page |
| Public API | Every component, function and constant of each subpath with a one-line summary, the type names, and a link to the subpath's Markdown reference |
| Common mistakes | Rules backed by the API (a missing stylesheet import, a controlled `value` without `onValueChange`, a control without an accessible name, callbacks passed from a Server Component), plus the bullets of a docs page's `## Common mistakes` section |
| Docs | Absolute links to the Markdown version (`.md`) of every docs page of the family, the API reference and `llms.txt` |

## Generated, never hand-written

Skills are built from the same sources as `llms.txt` and the Markdown
pages: the docs pages, the generated API reference (`api.json`) and the
package `exports`. The static export writes them with the rest of the
AI-readable docs, and the export check verifies that the discovery index
lists every skill with a matching name, a resolving URL and the sha256
digest of its file, and that every link in a skill resolves. Nothing is
committed, so a skill never drifts from the docs it summarizes.

## MCP server and page generation

**MCP server.** There is no Salmon UI MCP server package,
since an MCP server is a separate package with its own release flow. The
same knowledge is published as `/llms.txt`, `/llms-full.txt`, a Markdown
version of each page, `api.json` and these Agent Skills. Point your
assistant at `/llms.txt` or install the skills.

**Page generation.** There is no whole-page UI builder: it
depends on a blocks library, and the AI-readable docs and Agent Skills
already let a coding agent compose pages from Salmon components.
