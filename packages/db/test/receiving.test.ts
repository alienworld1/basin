import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createPersistence } from "../src/index";
import { isolatedDatabase } from "./database";
import {
  fixtureIdentity,
  fixtureOrganization,
  fixtureRelationship,
  hex,
  address,
} from "./fixtures";
import { fixtureEvidence } from "./evidence";
let database: Awaited<ReturnType<typeof isolatedDatabase>>;
let api: ReturnType<typeof createPersistence>;
let person: Awaited<ReturnType<typeof fixtureIdentity>>;
let org: Awaited<ReturnType<typeof fixtureOrganization>>;
let relation: Awaited<ReturnType<typeof fixtureRelationship>>;
before(async () => {
  database = await isolatedDatabase();
  await database.migrate();
  await database.migrate();
  api = createPersistence(database.url);
  person = await fixtureIdentity(api);
  org = await fixtureOrganization(api, "Receiving");
  relation = await fixtureRelationship(api, org, person, 555, false);
});
after(async () => {
  await api?.close();
  await database?.dispose();
});
test("protected preference saves/reloads and concurrent revisions do not lose edits", async () => {
  const values = {
    workspace_id: person.workspace.id,
    identity_id: person.identity.id,
    destination_ciphertext: "1.v1.encrypted-destination",
    key_version: "v1",
    revision: "0",
  };
  const first = await api.receiving.savePreference(values, null);
  assert.equal(first.revision, "0");
  const race = await Promise.allSettled([
    api.receiving.savePreference(
      { ...values, destination_ciphertext: "one" },
      "0",
    ),
    api.receiving.savePreference(
      { ...values, destination_ciphertext: "two" },
      "0",
    ),
  ]);
  assert.equal(
    race.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    (await api.receiving.preference(person.workspace.id))?.revision,
    "1",
  );
  assert.equal(await api.receiving.preference(org.workspace.id), null);
  await assert.rejects(
    api.receiving.savePreference(
      { ...values, workspace_id: org.workspace.id },
      null,
    ),
  );
});
test("one unresolved operation, exact idempotency, ownership and confirmation evidence", async () => {
  const values = {
    workspace_id: person.workspace.id,
    identity_id: person.identity.id,
    relationship_id: relation.relationship.id,
    relationship_token_id: relation.generation.relationship_token_id,
    identity_epoch: "0",
    resolver: address(15),
    profile_digest: hex(16),
    expected_record: "0x",
    target_epoch: "0",
    commitment: hex(17),
    descriptor_ciphertext: "protected",
    key_version: "v1",
    idempotency_key: "first",
    request_digest: hex(18),
    prepared_block: "12",
    prepared_expiry: new Date(Date.now() + 600_000),
  };
  const race = await Promise.all([
    api.receiving.prepare(values),
    api.receiving.prepare(values),
  ]);
  assert.equal(race[0].id, race[1].id);
  await assert.rejects(
    api.receiving.prepare({ ...values, request_digest: hex(19) }),
  );
  await assert.rejects(
    api.receiving.prepare({ ...values, idempotency_key: "second" }),
  );
  await assert.rejects(api.receiving.operation(org.workspace.id, race[0].id));
  await assert.rejects(
    api.receiving.update(org.workspace.id, race[0].id, { status: "FAILED" }),
  );
  await assert.rejects(
    api.receiving.update(person.workspace.id, race[0].id, {
      status: "CONFIRMED",
    }),
  );
  await api.receiving.update(person.workspace.id, race[0].id, {
    status: "SUBMITTED",
    transaction_hash: hex(20),
  });
  await assert.rejects(
    api.receiving.update(person.workspace.id, race[0].id, {
      transaction_hash: hex(21),
    }),
  );
  const confirmed = await api.receiving.update(
    person.workspace.id,
    race[0].id,
    {
      status: "CONFIRMED",
      receipt_block_number: "13",
      receipt_block_hash: hex(22),
      verified_at: new Date(),
    },
  );
  assert.equal(confirmed.status, "CONFIRMED");
  assert.equal(
    (
      await api.receiving.update(person.workspace.id, confirmed.id, {
        status: "UNKNOWN",
      })
    ).status,
    "CONFIRMED",
  );
  assert.equal(
    (await api.receiving.context(person.identity.id, relation.relationship.id))
      .relationship.status,
    "PENDING",
  );
  assert.ok(
    await api.receiving.prepare({
      ...values,
      idempotency_key: "second",
      target_epoch: "1",
      expected_record: hex(23),
    }),
  );
});
test("protected settlement append retries preserve history and omit ciphertext from public history", async () => {
  const activeOrg = await fixtureOrganization(api, "ActiveReceiving");
  const active = await fixtureRelationship(api, activeOrg, person, 655, true);
  const values = {
    approved_payee_generation_id: active.generation.id,
    approved_security_root_id: active.root!.id,
    settlement_epoch: "0",
    commitment: hex(30),
    descriptor_version: 1,
    chain_id: 11155111,
    asset_address: address(31),
    destination_ciphertext: "1.v1.protected",
    destination_fingerprint: null,
    valid_from: new Date(),
    superseded_at: null,
  };
  const evidence = fixtureEvidence("settlementVersion", values);
  const first = await api.relationships.appendSettlement(
    activeOrg.organization.id,
    evidence,
  );
  assert.equal(
    (
      await api.relationships.appendSettlement(
        activeOrg.organization.id,
        evidence,
      )
    ).id,
    first.id,
  );
  await api.relationships.appendSettlement(
    activeOrg.organization.id,
    fixtureEvidence("settlementVersion", {
      ...values,
      settlement_epoch: "1",
      commitment: hex(32),
      destination_ciphertext: "1.v1.next",
      valid_from: new Date(values.valid_from.getTime() + 1000),
    }),
  );
  const history = await api.relationships.history(
    activeOrg.organization.id,
    active.relationship.id,
  );
  assert.ok(
    !JSON.stringify(history, (_, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ).includes("1.v1.protected"),
  );
  const context = await api.receiving.context(
    person.identity.id,
    active.relationship.id,
  );
  assert.equal(context.versions.length, 2);
  assert.equal(context.versions[0].settlement_epoch, "1");
  assert.equal(context.versions[1].commitment, hex(30));
});

test("accepted version and operation confirmation commit atomically or both remain recoverable", async () => {
  const activeOrg = await fixtureOrganization(api, "AtomicReceiving");
  const active = await fixtureRelationship(api, activeOrg, person, 755, true);
  const op = await api.receiving.prepare({
    workspace_id: person.workspace.id,
    identity_id: person.identity.id,
    relationship_id: active.relationship.id,
    relationship_token_id: active.generation.relationship_token_id,
    identity_epoch: "0",
    resolver: address(755),
    profile_digest: hex(760),
    accepted_root_digest: active.root!.security_root_commitment,
    expected_record: "0x",
    target_epoch: "0",
    commitment: hex(761),
    descriptor_ciphertext: "protected-descriptor",
    key_version: "v1",
    idempotency_key: "atomic-receiving",
    request_digest: hex(762),
    prepared_block: "100",
    prepared_expiry: new Date(Date.now() + 600_000),
  });
  await api.receiving.update(person.workspace.id, op.id, {
    status: "VERIFYING",
    transaction_hash: hex(763),
    receipt_block_number: "101",
    receipt_block_hash: hex(764),
    verified_at: new Date(),
  });
  const values = {
    approved_payee_generation_id: active.generation.id,
    approved_security_root_id: active.root!.id,
    settlement_epoch: "0",
    commitment: op.commitment,
    descriptor_version: 1,
    chain_id: 11155111,
    asset_address: address(765),
    destination_ciphertext: "protected-account",
    destination_fingerprint: null,
    valid_from: new Date(),
    superseded_at: null,
  };
  await assert.rejects(
    api.receiving.finalize(person.workspace.id, op.id, {
      organizationId: activeOrg.organization.id,
      evidence: fixtureEvidence("settlementVersion", {
        ...values,
        chain_id: 1,
      }),
    }),
  );
  assert.equal(
    (await api.receiving.operation(person.workspace.id, op.id)).status,
    "VERIFYING",
  );
  assert.equal(
    (await api.receiving.context(person.identity.id, active.relationship.id))
      .versions.length,
    0,
  );
  const settlement = {
    organizationId: activeOrg.organization.id,
    evidence: fixtureEvidence("settlementVersion", values),
  };
  assert.equal(
    (await api.receiving.finalize(person.workspace.id, op.id, settlement))
      .status,
    "CONFIRMED",
  );
  await api.receiving.finalize(person.workspace.id, op.id, settlement);
  assert.equal(
    (await api.receiving.context(person.identity.id, active.relationship.id))
      .versions.length,
    1,
  );
});
