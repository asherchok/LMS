# LMS Frontend

React + Vite + TypeScript + Tailwind CSS v4 — the client for the LMS Flask API.

## Develop

Run the two servers side by side:

```bash
# Terminal 1 — backend API (from the repo root)
PORT=5001 ./.venv/bin/python app.py

# Terminal 2 — frontend dev server (from this folder)
npm install      # first time only
npm run dev      # http://localhost:5173
```

The dev server proxies `/api/*` to Flask on `:5001` (see `vite.config.ts`), so
the browser only ever talks to one origin.

## Build

```bash
npm run build    # type-checks (tsc -b) then bundles to dist/
npm run preview  # serve the production build locally
```

In production Flask serves `dist/` (wired up in a later phase), so the same
relative `/api` paths work unchanged.

## Structure

```
src/
  main.tsx          app entry (router + theme)
  App.tsx           routes
  index.css         Tailwind + theme tokens (dark-first, data-theme driven)
  components/       shared UI (Header, ThemeToggle, …)
  pages/            route views (Landing, Problem)
  hooks/            reusable hooks (useTheme, …)
  lib/              api client, helpers
```

## Theming

Dark-first. The active theme lives on `<html data-theme="dark|light">`, set
before paint in `index.html` and toggled via `useTheme`. Tokens are CSS
variables that flip per theme and are exposed to Tailwind (`bg-bg`, `text-fg`,
`border-ink`, `text-easy/medium/hard`, …) via `@theme inline`.
