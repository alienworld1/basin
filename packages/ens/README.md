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
