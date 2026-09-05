# Basin

Basin is a payment relationship layer for repeated business payments. The payer approves who may be paid while the payee controls where funds are received.

## Requirements

- Node.js 20.9 or newer
- pnpm 11 or newer

## Setup

```bash
cp .env.example apps/web/.env.local
pnpm install
# Set DATABASE_URL and DATABASE_MIGRATION_URL in your environment and apps/web/.env.local.
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3000`. The public product page is at `/`, the application shell is at `/app`, and configuration health is available at `/api/health`.

`SEPOLIA_RPC_URL` is optional at this stage because the application does not make network requests. `APP_URL` must be an absolute URL outside local development.

## Commands

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm build
```

The repository is one pnpm workspace. `apps/web` is the only runtime application and serves both the interface and Route Handlers; there is no separate backend process.

To verify configuration failures locally, temporarily set `APP_URL` or `SEPOLIA_RPC_URL` to a malformed value and run `pnpm build`, then restore the value. To exercise an error boundary, temporarily throw from the relevant page during local verification and revert that change before committing.

Database setup, least-privilege grants, migration review, isolated integration tests, and manual QA are documented in [the persistence guide](packages/db/README.md). Run `pnpm db:check` before deployment; `pnpm start` enforces this check before starting the production server.
