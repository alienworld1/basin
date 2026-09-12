# Basin SDK

`basin-sdk` is a framework-independent, read-only and preparation-only TypeScript surface for the shipped Basin Sepolia v1 protocol.

## Install

```sh
pnpm add basin-sdk viem
```

The package is ESM-only and requires Node.js 20.9 or newer. Browser-compatible transports are also supported.

## Quick start

```ts
import { createBasinClient } from "basin-sdk";

const basin = createBasinClient({ publicClient });
const identity = await basin.identity.resolve("acme.basin.eth");
```

The client accepts a viem public client and never accepts a signer, private key, Privy credential, database connection, or protected settlement destination in public reads. Only Ethereum Sepolia and the checked-in v1 deployment are supported. `payments.prepare` accepts a protected descriptor only to produce the exact Router call after its public commitment is verified; callers must keep that descriptor private.

All protocol integers remain `bigint`. Reads are observed at a reported block. Receipt verification is three-state: `VERIFIED`, `INVALID`, or `EVIDENCE_UNAVAILABLE`; transaction success or current ENS state alone is never verification.

The SDK does not submit, sign, relay, rotate settlement, create identities, or expose generic ENS/contract calls. `payees.prepareApproval` is staged: it first returns the controller's EIP-712 acceptance request; after the consumer supplies that signature, it returns the exact organization-authorized activation call. Relationship provisioning remains an explicit organization lifecycle step and is never hidden behind a mutation.
