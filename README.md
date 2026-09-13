# Basin

Basin is a payment relationship layer for repeated business payments. The payer approves who may be paid while the payee controls where funds are received.

## Requirements

- Node.js 20.9 or newer
- pnpm 11 or newer

## Setup

```bash
cp .env.example apps/web/.env.local
pnpm install
# Set the database and Privy values in your environment and apps/web/.env.local.
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3000`. The public product page is at `/`, the authenticated workspace entry is at `/app`, and configuration health is available at `/api/health`.

## Documentation and release checks

The public documentation application lives in `apps/docs` and is intentionally separate from the authenticated product. It has no product secrets, database access, wallet connection, or API routes.

```bash
pnpm --filter docs dev -- --port 3001
pnpm docs:check
pnpm --filter docs build
pnpm release:check
```

`pnpm release:check` includes deterministic package, documentation, product build, and database-configuration checks. The final Sepolia/Privy smoke path remains opt-in because it needs real credentials and funded disposable accounts: run `pnpm --filter basin-sdk smoke:sepolia` only with the reviewed release environment. Follow the manual lifecycle in [the release checklist](docs/release-evidence.md) before deployment.

Create a Privy development app, enable email one-time-code login, add `http://localhost:3000` as an allowed origin, and set `NEXT_PUBLIC_PRIVY_APP_ID` plus `PRIVY_APP_SECRET`. `NEXT_PUBLIC_PRIVY_CLIENT_ID` and `PRIVY_JWT_VERIFICATION_KEY` are optional. Personal workspace creation provisions an embedded EVM wallet on demand; Organization creation intentionally does not provision a treasury wallet yet.

Identity setup requires `SEPOLIA_RPC_URL`, the controlled ENSv2
`ENSV2_BASIN_REGISTRY_ADDRESS`, and the server-only
`ENSV2_REGISTRAR_PRIVATE_KEY`. The registry must be mounted at `basin.eth` on
the pinned Sepolia ENSv2 hierarchy and the registrar must hold only the narrow
namespace roles described in [the ENS integration guide](packages/ens/README.md).
`APP_URL` must be an absolute URL outside local development.

## Commands

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm build
pnpm test:auth
pnpm test:db
pnpm test:ens
```

## Authentication and workspace verification

1. Open `/`, choose **Open Basin**, and complete the real Privy email flow.
2. Create a Personal workspace and confirm the URL becomes `/app?workspace=<id>` without a seed-phrase prompt.
3. Sign out, sign back in, and confirm the persisted workspace is restored.
4. Create an Organization workspace from the switcher and confirm both workspaces appear in the chooser.
5. Edit the workspace query to malformed text, then to a valid ID the user cannot access, and confirm the not-found and permission recovery states reveal no workspace data.
6. In the Personal workspace, enter an available label, review and claim it,
   wait for read-back verification, then refresh and confirm the same active
   identity is resolved from Sepolia.

The repository is one pnpm workspace. `apps/web` is the only runtime application and serves both the interface and Route Handlers; there is no separate backend process.

To verify configuration failures locally, temporarily set `APP_URL` or `SEPOLIA_RPC_URL` to a malformed value and run `pnpm build`, then restore the value. To exercise an error boundary, temporarily throw from the relevant page during local verification and revert that change before committing.

Database setup, least-privilege grants, migration review, isolated integration tests, and manual QA are documented in [the persistence guide](packages/db/README.md). Run `pnpm db:check` before deployment; `pnpm start` enforces this check before starting the production server.

## Receiving accounts

Personal workspaces with a verified identity can save a protected receiving account. Configure the reviewed Sepolia asset and server-only encryption key, apply the new migration and runtime grants, then follow [receiving setup and verification](docs/receiving-verification.md). A saved preference does not claim active settlement or relationship approval. Relationship settlement services and isolated ENSv2 verification scripts are included; live approval and payment demonstrations require the later relationship/Router integration.
