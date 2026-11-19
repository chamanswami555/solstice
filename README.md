# Solstice

A secret gift exchange for your group, in one room. Built on the Nexconn Chat SDK for the Nexconn
Build Challenge 2026.

Status: in development. The specification is in `SPEC.md`. The task plan is in `tasks/`.

## Run it on your machine

1. Install Node.js 22 or later and PostgreSQL 17.
2. Copy `.env.example` to `.env.local` and set real values.
3. Run `npm install`, then `npm run dev`.
4. Open http://localhost:3000.

## Checks

```
npm test            unit and integration tests
npm run typecheck   type check
npm run lint        lint
npm run build       production build
```
