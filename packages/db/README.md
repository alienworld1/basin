# Basin persistence

`@basin/db` owns the private `basin` Postgres schema and server-only repositories. `@basin/domain` holds database-independent validation and transitions. No product route creates records yet. Supabase is the intended hosted Postgres provider; access uses Postgres directly, without Supabase Auth or its Data API.

## Connections and migrations

Set `DATABASE_URL` for runtime queries and `DATABASE_MIGRATION_URL` for an owner/direct or session connection in the repository root `.env`, or export them in your shell. Only `APP_ENV=development` (the default) or `APP_ENV=test` allows migration commands to fall back to `DATABASE_URL`. Database migration, status, and health commands load environment files from the repository root using the existing Next.js environment loader, regardless of pnpm’s package working directory. Exported variables take precedence; root `.env.local` and environment-specific files follow Next.js precedence. The web app still reads `apps/web/.env.local` separately.

```bash
pnpm install
pnpm db:status             # exits 1 for pending, inconsistent, or unavailable history
pnpm db:migrate            # applies reviewed migrations; safe to repeat
pnpm db:status
pnpm db:check              # runtime role: ok / unavailable / migration_required
pnpm build
pnpm start                 # refuses startup unless the database is current
```

For schema changes, edit `src/schema`, run `pnpm db:generate`, review the SQL and manifest, and commit the new migration and generated metadata together. Never edit applied migrations or use schema push. `migrations/0000_careless_rawhide_kid.sql` is the generated initial schema with narrow history triggers. `0001_protect_activation.sql` adds deferred activation/receipt guards discovered during integration review without rewriting the tested initial migration. The application manifest checks the exact ordered migration hashes and timestamps, including unknown future migrations. It checks migration history, not arbitrary out-of-band schema drift.

Keep `basin` out of Supabase's exposed schemas. Migrations revoke browser-role and PUBLIC privileges. Do not use a migration owner or Supabase service-role credential for normal runtime queries. Provision a dedicated application login through the deployment's secret manager, then run this using the migration connection:

```bash
psql "$DATABASE_MIGRATION_URL" -v runtime_role=basin_application -f packages/db/scripts/grant-runtime.sql
```

The grant file permits reads, inserts, mutable projections, and one-time version closure. It grants no schema creation, history mutation, or deletion. Reapply reviewed grants for newly added tables in later deployments. If hosting forces schema exposure, enable deny-by-default RLS before granting access; this module deliberately uses a private namespace.

## Integration tests

Tests require real local Postgres 16 or newer and a local administrator connection with `CREATEDB`. They refuse non-local hosts. Each invocation creates a cryptographically random `basin_test_*` database, applies migrations from zero twice, and drops only that database in teardown. There is no reset, truncate, or seed command for an existing database. Fixtures and evidence constructors are relative test imports and have no package export or application route.

A local instance can be started with an existing Postgres installation, or:

```bash
docker run --name basin-postgres -e POSTGRES_PASSWORD=local-only -p 5432:5432 -d postgres:16
export TEST_DATABASE_ADMIN_URL=postgresql://postgres:local-only@127.0.0.1:5432/postgres
pnpm test:db
```

The suite covers tenant isolation; concurrent user/member/payment creation; pending registration and complete bilateral root evidence; independent revocation/reapproval; version retention; exact amounts; obligation binding and terminal states; duplicate versus fresh request IDs; transaction rollback; Router-confirmed versus failed contenders; immutable receipts; restart reads; and safe health failure/recovery. Router fixtures assert persistence of externally confirmed outcomes; they do not simulate or prove an onchain atomic-spend implementation.

## Manual QA

1. Create a separate empty local development database. Configure the runtime and migration URLs, run `pnpm db:status` (pending), `pnpm db:migrate`, and `pnpm db:status` (current). Repeat migration and confirm it is safe.
2. Run `pnpm dev` and request `/api/health`: expect HTTP 200 with `checks.database: "ok"`. Open `/` and `/app` at desktop and mobile widths; there are no new UI elements or product records.
3. Run `pnpm test:db` with the separate local admin URL. Review the named test cases for domain integrity and concurrency. A second invocation starts from another fresh database.
4. Restart the app with `DATABASE_URL` pointing to an unused local port: health must return HTTP 503, `degraded`, and `unavailable`, without connection details. Restore the connection and restart; health returns to `ok`.
5. Point the app at a newly created empty disposable database: health must return HTTP 503 and `migration_required`. Apply migrations and retry; the running app recovers without source changes.
6. `pnpm db:check && pnpm start` must refuse an unreachable or unmigrated database. Never remove migrations or modify migration history in a shared database for QA.

## Authority and future integration boundaries

All tenant-owned operations require organization scope; workspace reads require user scope. Module 3 must verify sessions and membership before passing scope. Application roles are not chain/Privy authority.

The public package exports opaque evidence types, but no evidence constructor. Non-test activation, identity, settlement-version, obligation, execution, and finalization writes reject unregistered evidence at runtime, even if TypeScript is bypassed. Modules 4/5/7/9 will add narrowly reviewed internal producers after real ENS, signature, Privy, and Router verification. A browser payload or a `verified: true` property cannot create proof.

`createOrResume` generates the economic payment ID once, normalizes and hashes the strict request, acquires its scoped idempotency key, and writes the payment and initial event atomically. All subsequent transitions lock the payment and append one ordered event. Payment requests never accept destinations or caller-selected payment IDs.

Obligation capacity is a cached preflight value. Creating a payment does not reserve/decrement it. Only verified Router projections or confirmed settlement evidence reduce the cache. Finalization records the exact historical before/after amounts; out-of-order confirmed results cannot increase the current cache. The Router owns atomic aggregate-spend enforcement and finality rules.

Settlement destination columns remain null, are rejected on writes, and are omitted from default reads. Module 5 owns encryption/key management. Immutable accepted roots, events, snapshots, and receipts have no update/delete repository operations and are additionally protected by database triggers. Identity/settlement versions and generations allow only one-time closure. No external network call runs inside a database transaction.

Dependencies are limited to Drizzle ORM/Kit and drizzle-zod (schema, migrations, validation), pg (Postgres driver), server-only (Next.js boundary), existing Zod/TypeScript, tsx plus Node's built-in test runner, and small maintained EVM checksum/ENSIP-15 utilities in the domain package. No payment, auth, or chain client is introduced.

After building, `pnpm --filter @basin/db test:http` runs the HTTP recovery path automatically using the same `TEST_DATABASE_ADMIN_URL`; it starts and stops its own local app process on port 3319. In an environment that restricts Turbopack worker sockets, `pnpm build --webpack` provides the supported build fallback without changing project configuration.
