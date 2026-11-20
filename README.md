# Solstice

A secret gift exchange for your group, in one room. Built on the Nexconn Chat SDK for the Nexconn
Build Challenge 2026.

Status: in development. The specification is in `SPEC.md`. The task plan is in `tasks/`.

## Run it on your machine

1. Install Node.js 22 or later and PostgreSQL 17.
2. Create a database, for example `createdb solstice_dev`.
3. Copy `.env.example` to `.env.local` and set real values.
4. Run `npm install`, then `npm run db:migrate`, then `npm run dev`.
5. Open http://localhost:3000.

## Settings

The server reads its settings from the environment and refuses to start on a missing value or a
placeholder.

| Name | Needed | What it is |
| --- | --- | --- |
| `DATABASE_URL` | Always | PostgreSQL address. On the host, use the pooled address |
| `SESSION_SECRET` | Always | 32 or more random characters. It signs the identity cookie |
| `NEXCONN_APP_KEY`, `NEXCONN_APP_SECRET`, `NEXCONN_REGION` | In production, unless `CHAT=off` | From the Nexconn console. Region is `sg`, `na` or `sau` |
| `CHAT` | Optional | `off` runs production with chat switched off. Do not set it together with the Nexconn keys |
| `DATABASE_URL_DIRECT` | Only on the machine that runs migrations | The direct (not pooled) address of the hosted database |

## Checks

```
npm test            unit and integration tests (needs a local database named solstice_test)
npm run typecheck   type check
npm run lint        lint
npm run build       production build
npm run test:e2e    browser tests against the production build
```

## Deploy

The website runs on a Node.js host with a PostgreSQL 17 database.

1. Set `DATABASE_URL_DIRECT` in `.env.local` and run `npm run db:migrate:live`. The command prints
   the database host before it runs, and applies each migration file one time.
2. Set `DATABASE_URL` (pooled address), `SESSION_SECRET` and the chat settings on the host.
3. Deploy the `main` branch.
4. Run the checks that write nothing against the public address:
   `E2E_BASE_URL=https://your-address npm run test:e2e`

Every response carries a content security policy and the other security headers from
`next.config.ts`. To go back to an earlier version, promote the earlier deployment on the host.
A migration only adds to the schema, so an earlier version of the code runs on a newer schema.
