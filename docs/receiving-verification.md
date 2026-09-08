# Receiving implementation and verification

Receiving is integrated beneath the Personal identity. A saved account is an encrypted preference, with no epoch, commitment, transaction, or active-payment claim. Relationship-scoped settlement preparation, controller submission, verification, and history are implemented separately.

## Configuration and startup

Set these server-only values in the web application's environment:

- `SETTLEMENT_ASSET_ADDRESS`: the reviewed ERC-20 contract on Ethereum Sepolia.
- `SETTLEMENT_ASSET_SYMBOL`: its exact symbol. Saving/preparation independently checks chain, deployed code, and symbol.
- `SETTLEMENT_ENCRYPTION_KEY`: a new 32-byte key encoded as 64 hexadecimal characters (`openssl rand -hex 32`).
- `SETTLEMENT_KEY_VERSION`: a short identifier, such as `v1`.

Keep existing database, Privy, and ENS configuration. Never publish the encryption key; retain it while its encrypted data is needed. The current implementation uses one configured key version and fails closed on another version. Coordinated key migration is separate operational work.

The web app reads `apps/web/.env.local`; database and ENS command-line tools load root environment files or exported environment variables. Apply `pnpm db:migrate`, then reapply `packages/db/scripts/grant-runtime.sql` for the existing least-privilege runtime role. Run `pnpm dev` and open `/app`.

## Personal workspace checks

1. Sign in and open a Personal workspace with a verified identity. The identity remains visible while Receiving loads.
2. Choose **Set up receiving**. Verify invalid, zero, and malformed-checksum destinations fail without a wallet prompt. A known Basin contract is rejected by the server.
3. Review the full destination and fixed asset/network, save, and refresh. Expect **Receiving account saved** and the pending-relationship explanation; no protocol epoch or hash appears.
4. Edit in two tabs. After one saves, the other must encounter a revision conflict rather than overwrite the account.
5. Sign out and request `/api/settlement/status?workspaceId=<id>`: expect 401 and `Cache-Control: no-store`. Use another valid user's Bearer token against the first workspace: expect denial. Organization workspaces also fail ownership authorization.
6. Repeat at 360px, 200% zoom, keyboard only, dark theme, and reduced motion. Review uses the existing native-dialog sheet. Closing restores focus; successful completion focuses Receiving. Inspect the complete destination, associated error text, and status announcements.

## Isolated ENSv2 verification

These scripts do not create application database rows, activation evidence, or product fixtures. Use disposable funded Sepolia accounts and an existing real Basin identity controlled by the disposable controller. Provision and fund accounts externally.

The scripts use the pinned upstream deployment `48b3e2d39513b9dd32ef1850877a29009bc807b9`, dated 2026-06-29. Export the existing RPC/registry configuration and keep fixture private keys in local secret configuration, never command arguments or version control.

1. Set `SETTLEMENT_FIXTURE_PAYER_KEY` to a disposable funded payer distinct from the controller and registrar. Set `ENSV2_REGISTRAR_PRIVATE_KEY` for the existing narrow namespace registrar. Run:

   ```bash
   pnpm --filter @basin/ens check:deployment
   pnpm --filter @basin/ens provision:settlement alice.basin.eth 0xController
   ```

   Provisioning creates a new random `qa-…` organization namespace with a frozen relationship resolver. Save the printed public name, addresses, deployment revision, and transaction hashes. The payer retains only registry registration/renewal/revocation roles and their admins. The controller receives only the exact settlement-record grant.

2. Set `SETTLEMENT_FIXTURE_CONTROLLER_KEY` to that identity's disposable controller key; set `SETTLEMENT_FIXTURE_DESTINATION_A`, `SETTLEMENT_FIXTURE_DESTINATION_B`, and the reviewed `SETTLEMENT_ASSET_ADDRESS` in local secret configuration. Run:

   ```bash
   pnpm --filter @basin/ens exercise:settlement alice.qa-REPLACE.basin.eth 0xController
   ```

   The harness requires an absent record, submits epoch zero then epoch one, and uses the same adapter preparation, simulation, freshness, and receipt/current-state verification as the application. Only public commitments and transaction/block evidence are printed. The fixture cannot create an Active application relationship.

3. Independently verify the resulting state and actual contract call denials:

   ```bash
   pnpm --filter @basin/ens verify:settlement alice.qa-REPLACE.basin.eth 0xController 0xPayer 0xOperator
   ```

   The read-only harness calls the actual contracts with controller, payer, and operator senders. It checks the expected permitted write and denial of payer/operator writes, another key/name, clear-records, aliases, and root-role restoration. It does not submit unauthorized transactions or spend their gas.

## Relationship integration contract

The relationship integration supplies actual `ApprovedPayee` and `ApprovedPayeeGeneration` rows, a real mounted relationship with the frozen permission profile, and later authoritative Router activation. The normal routes can prepare an initial record for a real pending relationship. Before bilateral activation, confirmed descriptor/evidence remains in the protected operation journal; it does not manufacture an accepted root or weaken `SettlementVersion` foreign keys.

`createReceivingService` accepts an `ActivationReader` server dependency for an independently read Router activation. The default deliberately rejects Active relationship mutation/continuity assertions until that integration exists. The adapter exports the exact resolver/registry profile hashes and verified security context for that integration. Existing DB roots alone never enable approval wording.

The accepted-root-backed path atomically appends a protected `SettlementVersion` and confirms its journal operation. The relationship integration must explicitly associate an initial pending commitment with the eventual activation; the pending journal is not itself an accepted-root-backed version. Do not claim the complete product activation/payment demonstration before this integration exists.

## Transaction and failure checks

- Review prepares and encrypts the exact operation before signing. `POST /api/settlement/authorize` rechecks it and atomically issues the wallet request once. `DELETE /api/settlement/prepare` cancels only a preparation that has not been issued.
- Repeat preparation with the same idempotency key/request: same operation. Change the destination under that key: conflict. A second unresolved operation on the relationship conflicts.
- After another tab or external controller changes the record, confirmation of the old prepared review fails; it never silently switches epochs.
- Explicit wallet rejection is distinguished from ambiguous broadcast. Rejection cancellation requires an issued operation without a known hash and a fresh unchanged record/profile. It is a wallet workflow observation, not proof of a reverted chain transaction.
- Unknown results remain locked. Reconciliation scans controller transactions from the preparation block in bounded batches, at most the first 65 blocks. If no unique call is located, it remains Unknown. No automatic transaction resubmission occurs.
- Hashes are lookup hints. Verification checks sender, chain, recipient contract, exact calldata, zero value, receipt success, two confirmations, canonical block hash, receipt-block record/profile, and current record/profile. Replacement hints must match the same sender/nonce and exact intended call.
- Interrupt RPC after submission, restore it, and choose **Check again**. Reload uses the same server journal. A verified transaction with database finalization failure stays in syncing/recovery; retries do not require another signature.
- Malformed, cleared, regressive, conflicting, or unknown higher-epoch records cannot replace trusted private history. Missing descriptors are not reconstructed from their hash.
- Registry expiry/revocation, controller/token changes, resolver implementation changes, aliases, and broad/admin permission grants block normal mutation. Failed reads remove current trust claims.
- Generic ENS `setData` does not implement compare-and-swap or protocol-enforced epoch monotonicity. Application serialization does not prevent direct authorized external writes. Reorg checks reduce exposure; two confirmations are not finality.

## Verification evidence and remaining gates

The live deployment preflight passed against the configured Sepolia RPC. Local codec, permission-profile, authenticated-input, encryption, recovery, and Postgres concurrency/history tests passed during implementation. These are supporting tests; deterministic adapters do not prove live ENS authorization or Router behavior.

Live fixture provisioning/writes/denials and signed-in browser interaction were not run: reviewed receiving configuration and disposable funded fixture credentials were absent. No fixture transaction hashes are claimed. Browser checks at 360px/200% zoom, actual wallet rejection, reload during a real transaction, and real cross-user authenticated HTTP denial remain manual QA steps.

All three integration acceptance gates remain unavailable: real accepted-root-backed initial setup through the Router, live approval-preserving rotation, and an unchanged real completed receipt. Existing immutable-receipt tests pass but do not substitute for that receipt demonstration.

The production Webpack build passed with warnings from the installed Privy/viem optional integrations. Default Turbopack builds encountered a worker port-binding restriction in this environment. No dependencies, landing-page changes, treasury controls, relationship creation routes, or payment execution were added.
