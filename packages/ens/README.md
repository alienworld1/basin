# `@basin/ens`

This package is Basin's framework-independent ENSv2 boundary. It owns name
normalization, the `basin.identity` V1 codec, Sepolia registry and resolver
calls, resolver permission composition, registration, and independent
read-back verification.

The pinned official ENSv2 deployment is the Sepolia deployment dated
2026-06-29 at upstream commit
`48b3e2d39513b9dd32ef1850877a29009bc807b9`. Contract addresses live in
`src/deployment.ts`; `basin.eth` itself is a separately controlled UserRegistry
and is supplied as `ENSV2_BASIN_REGISTRY_ADDRESS`.

The namespace prerequisite is intentionally not automated by the product. The
configured registry must already be mounted as `basin.eth`, use the pinned
UserRegistry implementation, be emancipated from dangerous root roles, and
grant the configured registrar only the root registration/renewal capability.
The adapter checks these properties and fails closed before a claim.

Run the deployment preflight:

```bash
SEPOLIA_RPC_URL=... \
ENSV2_BASIN_REGISTRY_ADDRESS=0x... \
pnpm --filter @basin/ens check:deployment
```

Verify a claimed identity from live chain state:

```bash
SEPOLIA_RPC_URL=... \
ENSV2_BASIN_REGISTRY_ADDRESS=0x... \
pnpm --filter @basin/ens verify:live alice.basin.eth 0xController
```

Registration additionally requires the server-only
`ENSV2_REGISTRAR_PRIVATE_KEY`. Never use a signer with dangerous namespace root
roles or identity resolver authority.

## Relationship settlement

`settlement-record.ts` defines Basin V1, not an ENS standard. The descriptor is ordinary ABI encoding of `(uint8 version, uint256 chainId, address asset, address destination, uint256 settlementEpoch, uint256 validFrom)` (192 bytes). Its keccak256 commitment is stored in the relationship's `basin.settlement` record as `(uint8 version, uint256 settlementEpoch, bytes32 commitment)` (96 bytes). Initial epoch is zero; ordinary application changes advance by one. Shared vectors and malformed-input cases are in `test/settlement.test.ts`.

The descriptor itself does not bind a relationship. Its authority depends on the exact resolved relationship generation, recipient permissions, and, for approval continuity, an independently verified Router activation. The adapter checks frozen root/name/wildcard/exact-record permissions, implementation, alias absence, lifecycle, and current versus receipt-block state. It signs nothing.

See [receiving verification](../../docs/receiving-verification.md) for configuration, controller harnesses, authorization-denial checks, and the unavailable integration gates. ENS CLI tools load root environment files or exported variables. Run `pnpm --filter @basin/ens test:settlement` for focused local checks.

Reviewed references: [Permissioned Resolver](https://docs.ens.domains/ensv2/permissioned-resolver/), [Enhanced Access Control](https://docs.ens.domains/ensv2/enhanced-access-control/), and [Permissioned Registry](https://docs.ens.domains/ensv2/permissioned-registry/).
