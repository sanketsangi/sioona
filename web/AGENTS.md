# Agent guidelines

## Web Interface Guidelines

Follow [Vercel Web Interface Guidelines](https://vercel.com/design/guidelines) for all UI work.

In Cursor, run `/web-interface-guidelines` on changed UI files after generating or editing interfaces.

Project UI SoT also includes:

- `.cursor/rules/geist-design-system.mdc`
- `.cursor/rules/sioona-ui-app.mdc`

Prefer native semantics, URL as state for filters/tabs/pagination, Title Case action labels, ellipsis character `…` on loading states, and never `transition: all`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
