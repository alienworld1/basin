# Organization treasury controls

## Local verification

1. Configure Privy authentication, organization controls, `DATABASE_URL`, and a dedicated `TREASURY_ROUTINE_KEY_ENCRYPTION_KEY` (64 hex characters) with `TREASURY_ROUTINE_KEY_VERSION`.
2. Apply migrations with `pnpm db:migrate`.
3. Sign in, create or select an Organization workspace, and choose **Review setup** under **Treasury controls**.
4. Confirm setup. Refresh during provisioning and resume with the same browser session; the server reuses the stored operation and provider idempotency identifiers.
5. Until the reviewed Router deployment manifest is configured, confirm the result is **Organization account ready** and no policy is attached to the routine signer.
6. Open **Technical details** and verify the organization, wallet, owner authority, routine access reference, and last verification time are present without secrets.
7. Sign in as a payment operator and confirm setup and repair actions are unavailable. A direct setup request must return permission denied.

After the reviewed Router manifest and transaction verification fixture are configured, run:

```sh
pnpm --filter web verify:treasury <workspace-id>
```

The command fails closed while the manifest or verified `READY` evidence is missing. Complete the real allowed and disallowed Sepolia transaction checks; those results must never be simulated.
