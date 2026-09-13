# Release evidence

This checklist records release-candidate evidence. It is
deliberately conservative: a missing external environment or live proof is
recorded as blocked or not run, never inferred from a local build.

Review revision: repository revision under review.

| ID | Area | Preconditions | Expected result | Automated coverage | Manual evidence | Result |
| --- | --- | --- | --- | --- | --- | --- |
| REL-001 | docs | Workspace dependencies installed | Docs app typechecks, builds, and indexes all required routes | `pnpm --filter docs lint`, `typecheck`, `build`, and `docs:check` | Local static build indexed 25 documentation pages | pass |
| REL-002 | docs | Checked-in public release manifests | Docs metadata, route set, and SDK examples agree with public manifests | `pnpm docs:check` | Release data, 25 routes, and public API references validated | pass |
| REL-003 | SDK | Workspace dependencies installed | SDK unit tests, consumer compile, tarball surface, and ESM declarations pass | SDK `test`, `test:consumer`, and `check:package` | pnpm-packed temporary artifact passed `publint` and `attw` ESM profile | pass |
| REL-004 | contracts | Workspace dependencies installed | Router identifiers and metadata commitments remain deterministic | `pnpm --filter @basin/contracts test` | 3 deterministic contract checks passed | pass |
| REL-005 | ENS | Workspace dependencies installed | ENS lifecycle checks remain deterministic | `pnpm --filter @basin/ens test` | 13 deterministic ENS checks passed | pass |
| REL-006 | product | Workspace dependencies installed | Product route and authority unit tests pass | `pnpm --filter web test` | 46 checks passed after hardening fixes | pass |
| REL-007 | product | Current code served by release candidate | An obligation with a stale relationship generation is visibly blocked and cannot authorize | `web test` and TypeScript checks | Hosted development build showed the stale generation, adopted the verified current generation, and returned the obligation to `Expected` | pass |
| REL-008 | database | Test database runtime and migration URLs | Repository integration suite and migration check pass | `pnpm db:check` | No test database is available for this release candidate | blocked |
| REL-009 | identity | Two disposable authenticated Sepolia users | Personal identity claim and receiving setup/rotation survive refresh | manual | Requires live release candidate and disposable identities | not run |
| REL-010 | treasury | Disposable organization and funded Sepolia USDC path | Treasury controls and least-privilege payment operator flow pass | manual | Requires live release candidate and Privy policy environment | not run |
| REL-011 | payee | Active organization relationship and recipient authority | Approval, acceptance, renewal, and revocation enforce split authority | manual | A fresh recipient acceptance reconciled to an active relationship with verified receiving state. Renewal and revocation remain unverified. | not run |
| REL-012 | payment | Authorized active payee and funded organization wallet | Exact Router payment, receipt verification, rotation, and post-revocation block pass | manual | A payment operator submitted the refreshed exact 1 USDC obligation. The resulting Router receipt is `VERIFIED` with 11 confirmations. Rotation and post-revocation blocking remain unverified. | not run |
| REL-013 | recovery | Forced provider, RPC, session, and evidence failures | Each failure has truthful copy and safe reconciliation | Web deterministic tests plus manual | Live failure matrix requires release candidate configuration | not run |
| REL-014 | accessibility | Docs and product release candidate | Keyboard, focus, responsive, zoom, dark, and reduced-motion checks pass | Docs static checks; web typecheck | Manual browser audit still required on the served repaired product and deployed docs | not run |
| REL-015 | deployment | Public production product, docs, npm, repository, and explorers | Canonical URLs, revision, versions, assets, and secret scan agree | Docs release/content checks | Production docs URL and final deployed revision have not been supplied | blocked |

## Release decision

Do not mark this release candidate complete until REL-008 through REL-015 have
current evidence. The deterministic gates above are necessary but do not replace
the required database, live Sepolia/Privy, accessibility, and deployed-artifact
verification.
