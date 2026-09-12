# Publishing `basin-sdk`

The package is configured as a public unscoped ESM package. Its publish hook runs typechecking, deterministic tests, the external-consumer compile check, a production build, `publint`, and Are the Types Wrong before npm accepts a release.

## One-time setup

1. Install the Node.js and pnpm versions required by the repository (`node >=20.9.0`, `pnpm >=11`).
2. Confirm that the intended npm account can publish the unscoped `basin-sdk` package.
3. Sign in with `npm login` and confirm the intended account with `npm whoami`.
4. The SDK is released under the MIT license. Keep `LICENSE` and the `MIT` package metadata in sync if the licensing terms change.

## Release checklist

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter basin-sdk typecheck
pnpm --filter basin-sdk test
pnpm --filter basin-sdk test:consumer
pnpm --filter basin-sdk pack:check
```

Inspect the dry-run file list. It should contain only `dist/index.js`, `dist/index.d.ts`, `README.md`, and the generated `package.json` metadata. In particular, it must not contain source, tests, scripts, environment files, protected descriptors, or application/database code.

Run the live Sepolia smoke test separately when you have the identifiers and RPC environment documented by `scripts/smoke-sepolia.ts`:

```sh
pnpm --filter basin-sdk smoke:sepolia
```

The smoke test is intentionally not part of the deterministic publish hook.

## Publish a release

1. Update `packages/sdk/package.json` to a version that has never been published. Follow semantic versioning: patch for compatible fixes, minor for compatible additions, and major for breaking API changes.
2. Commit the release changes and ensure the working tree contains only the changes you intend to release.
3. From the repository root, publish the workspace package:

```sh
pnpm --filter basin-sdk publish --access public
```

`publishConfig` already sets public access and npm provenance. Provenance requires publishing from a supported CI provider with an OIDC identity; if publishing interactively from a local machine, use the same command with `--no-provenance`.

4. Verify the registry result without relying on the workspace copy:

```sh
npm view basin-sdk version dist.integrity
```

Then install that exact version in a clean external project and run a minimal import:

```sh
mkdir /tmp/basin-sdk-check
cd /tmp/basin-sdk-check
pnpm init
pnpm add basin-sdk@<published-version> viem
node -e "import('basin-sdk').then(m => console.log(Object.keys(m)))"
```

If `basin-sdk` is already claimed on npm, choose another unscoped package name before the first release and update the README and consumer fixture to match it.
