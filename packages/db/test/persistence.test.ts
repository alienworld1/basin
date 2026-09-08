import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { and, count, eq } from "drizzle-orm";
import { address as parseAddress, amount, DomainError } from "@basin/domain";
import { createPersistence, databaseHealth } from "../src/index";
import {
  ApprovedPayee,
  ApprovedPayeeGeneration,
  ApprovedSecurityRoot,
  BasinIdentity,
  IdempotencyKey,
  Obligation,
  Payment,
  PaymentAuthoritySnapshot,
  PaymentEvent,
  Receipt,
  SettlementVersion,
  Organization,
  OrganizationMember,
  Workspace,
} from "../src/schema/tables";
import { isolatedDatabase } from "./database";
import { fixtureEvidence as verified } from "./evidence";
import {
  address,
  executing,
  fixtureEnvelope,
  fixtureIdentity,
  fixtureOrganization,
  fixtureRelationship,
  future,
  hex,
  past,
  paymentRequest,
  settlementEvidence,
} from "./fixtures";
import type { Envelope, Persistence } from "./fixtures";

let database: Awaited<ReturnType<typeof isolatedDatabase>>;
let api: Persistence;
let envelope: Envelope;
let other: Awaited<ReturnType<typeof fixtureOrganization>>;
const rejects = (operation: Promise<unknown>, code: string) =>
  assert.rejects(
    operation,
    (error) => error instanceof DomainError && error.code === code,
  );

before(async () => {
  database = await isolatedDatabase();
  assert.equal(await databaseHealth(database.url), "migration_required");
  await database.migrate();
  await database.migrate();
  assert.equal(await databaseHealth(database.url), "ok");
  api = createPersistence(database.url);
  const person = await fixtureIdentity(api);
  const organization = await fixtureOrganization(api, "Acme");
  other = await fixtureOrganization(api, "Beta");
  envelope = await fixtureEnvelope(api, organization, person, 20);
});
after(async () => {
  await api?.close();
  await database?.dispose();
});

test("lossless validation, canonical users, scoped workspace and membership", async () => {
  const large = "9".repeat(78);
  assert.equal(amount.parse(large), large);
  assert.equal(amount.parse("0001"), "1");
  assert.throws(() => amount.parse(1));
  assert.throws(() => amount.parse("1.5"));
  assert.throws(() =>
    parseAddress.parse("0x5Aeda56215b167893e80B4fE645BA6d5Bab767DE"),
  );
  const users = await Promise.all(
    [1, 2].map(() =>
      api.workspaces.findOrCreateUser({ privy_user_id: "fixture:concurrent" }),
    ),
  );
  assert.equal(users[0].id, users[1].id);
  const personalWorkspace = await api.workspaces.createPersonalWorkspace(
    users[0].id,
    "Concurrent user",
  );
  const organizationWorkspace =
    await api.workspaces.createOrganizationWorkspace(
      users[0].id,
      "Concurrent company",
    );
  const accessible = await api.workspaces.listAccessibleWorkspaces(users[0].id);
  assert.deepEqual(
    accessible
      .filter((workspace) =>
        [personalWorkspace.id, organizationWorkspace.id]
          .map(String)
          .includes(workspace.id),
      )
      .map((workspace) => workspace.role),
    ["OWNER", "ADMIN"],
  );
  const [organization] = await database.db
    .select()
    .from(Organization)
    .where(eq(Organization.workspace_id, organizationWorkspace.id));
  const [administrator] = await database.db
    .select()
    .from(OrganizationMember)
    .where(
      and(
        eq(OrganizationMember.organization_id, organization.id),
        eq(OrganizationMember.user_id, users[0].id),
      ),
    );
  assert.equal(administrator.role, "ADMIN");
  await rejects(
    api.workspaces.readWorkspace(other.user.id, organizationWorkspace.id),
    "NOT_FOUND",
  );
  const [{ value: beforeInvalidOrganization }] = await database.db
    .select({ value: count() })
    .from(Workspace)
    .where(eq(Workspace.owner_user_id, users[0].id));
  await rejects(
    api.workspaces.createOrganizationWorkspace(users[0].id, " "),
    "INVALID_INPUT",
  );
  const [{ value: afterInvalidOrganization }] = await database.db
    .select({ value: count() })
    .from(Workspace)
    .where(eq(Workspace.owner_user_id, users[0].id));
  assert.equal(afterInvalidOrganization, beforeInvalidOrganization);
  const memberships = await Promise.all(
    [1, 2].map(() =>
      api.workspaces.addMember(envelope.org.organization.id, {
        user_id: users[0].id,
        role: "PAYMENT_OPERATOR",
      }),
    ),
  );
  assert.equal(memberships[0].id, memberships[1].id);
  assert.equal(
    (await api.workspaces.readWorkspace(users[0].id, envelope.org.workspace.id))
      .id,
    envelope.org.workspace.id,
  );
  await rejects(
    api.workspaces.readWorkspace(other.user.id, envelope.person.workspace.id),
    "NOT_FOUND",
  );
  await rejects(
    api.workspaces.createOrganization(
      envelope.person.user.id,
      envelope.person.workspace.id,
    ),
    "INVALID_INPUT",
  );
  assert.equal(
    (await api.identities.findByName("ALICE.basin.eth")).id,
    envelope.person.identity.id,
  );
});

test("registration alone stays pending; acceptance must match controller, generation and complete root", async () => {
  const relationship = await fixtureRelationship(
    api,
    other,
    envelope.person,
    60,
    false,
  );
  assert.equal(
    (
      await api.relationships.read(
        other.organization.id,
        relationship.relationship.id,
      )
    ).status,
    "PENDING",
  );
  await assert.rejects(
    database.db
      .update(ApprovedPayee)
      .set({ status: "ACTIVE" })
      .where(eq(ApprovedPayee.id, relationship.relationship.id)),
  );
  await rejects(
    api.relationships.acceptRoot(other.organization.id, {
      ...relationship.rootEvidence,
    }),
    "INVALID_INPUT",
  );
  await rejects(
    api.relationships.acceptRoot(
      other.organization.id,
      verified("activation", {
        ...relationship.rootEvidence,
        identity_controller: address(999),
      }),
    ),
    "INVALID_INPUT",
  );
  const { recipient_acceptance_signature, ...incomplete } =
    relationship.rootEvidence;
  void recipient_acceptance_signature;
  // Runtime validation must reject incomplete evidence even if a faulty adapter bypasses TypeScript.
  await rejects(
    api.relationships.acceptRoot(
      other.organization.id,
      verified("activation", incomplete) as typeof relationship.rootEvidence,
    ),
    "INVALID_INPUT",
  );
  await rejects(
    api.relationships.acceptRoot(
      envelope.org.organization.id,
      relationship.rootEvidence,
    ),
    "NOT_FOUND",
  );
  await api.relationships.acceptRoot(
    other.organization.id,
    relationship.rootEvidence,
  );
  assert.equal(
    (
      await api.relationships.find(
        other.organization.id,
        envelope.person.identity.id,
      )
    ).status,
    "ACTIVE",
  );
  await api.relationships.end(
    other.organization.id,
    verified("relationshipEnd", {
      approved_payee_id: relationship.relationship.id,
      generation_id: relationship.generation.id,
      status: "REVOKED" as const,
      occurred_at: new Date(),
    }),
  );
  assert.equal(
    (
      await api.relationships.read(
        envelope.org.organization.id,
        envelope.relationship.id,
      )
    ).status,
    "ACTIVE",
  );
  assert.deepEqual(
    await api.identities.findByPayeeId(envelope.person.identity.payee_id),
    envelope.person.identity,
  );
  const generation = await api.relationships.appendGeneration(
    other.organization.id,
    verified("generation", {
      approved_payee_id: relationship.relationship.id,
      generation_number: 2,
      relationship_token_id: "61",
      registered_at: new Date(),
      expires_at: future,
      relationship_namehash: hex(61),
      relationship_registry_address: address(60),
      relationship_name: "alice.beta.basin.eth",
    }),
  );
  await api.relationships.acceptRoot(
    other.organization.id,
    verified("activation", {
      ...relationship.rootEvidence,
      approved_payee_generation_id: generation.id,
      relationship_token_id: "61",
      activated_at: new Date(),
      activation_transaction_hash: hex(79),
      security_root_commitment: hex(78),
    }),
  );
  const history = await api.relationships.history(
    other.organization.id,
    relationship.relationship.id,
  );
  assert.equal(history.length, 2);
  assert.equal(history[0].generation.end_reason, "REVOKED");
  assert.equal(
    history[0].root?.security_root_commitment,
    relationship.rootEvidence.security_root_commitment,
  );
});

test("idempotent creation races produce one payment and one initial event", async () => {
  const request = paymentRequest(envelope, "equivalent");
  const results = await Promise.all([
    api.payments.createOrResume(envelope.org.organization.id, request),
    api.payments.createOrResume(envelope.org.organization.id, {
      ...request,
      amount_base_units: "060",
      purpose: " Design services ",
    }),
  ]);
  assert.equal(results[0].id, results[1].id);
  assert.equal(
    (await api.payments.events(envelope.org.organization.id, results[0].id))
      .length,
    1,
  );
  await rejects(
    api.payments.createOrResume(envelope.org.organization.id, {
      ...request,
      amount_base_units: "61",
    }),
    "CONFLICT",
  );
  for (const override of [
    { purpose: "Other work" },
    { asset_address: address(201) },
    { external_reference: "INV-02" },
    { approved_payee_id: 999n },
    { approved_payee_generation_id: 999n },
    { obligation_record_id: 999n },
  ]) {
    await rejects(
      api.payments.createOrResume(envelope.org.organization.id, {
        ...request,
        ...override,
      }),
      "CONFLICT",
    );
  }
  const [total] = await database.db.select({ count: count() }).from(Payment);
  assert.equal(total.count, 1);
  assert.equal(
    (
      await api.obligations.read(
        envelope.org.organization.id,
        envelope.obligation.id,
      )
    ).remaining_amount_base_units,
    "100",
  );
});

test("tenant isolation and fresh identifiers never bypass an obligation", async () => {
  const orgId = envelope.org.organization.id;
  await rejects(
    api.payments.createOrResume(
      other.organization.id,
      paymentRequest(envelope, "foreign"),
    ),
    "NOT_FOUND",
  );
  await rejects(
    api.obligations.read(other.organization.id, envelope.obligation.id),
    "NOT_FOUND",
  );
  await rejects(
    api.relationships.read(other.organization.id, envelope.relationship.id),
    "NOT_FOUND",
  );
  const payment = await api.payments.createOrResume(
    orgId,
    paymentRequest(envelope, "equivalent"),
  );
  await rejects(
    api.payments.read(other.organization.id, payment.id),
    "NOT_FOUND",
  );
  await rejects(
    api.payments.transition(other.organization.id, {
      payment_id: payment.id,
      expected_status: "DRAFT",
      to_status: "VALIDATING_AUTHORITY",
    }),
    "NOT_FOUND",
  );
  assert.deepEqual(
    await api.payments.events(other.organization.id, payment.id),
    [],
  );
  await rejects(
    api.payments.createOrResume(orgId, {
      ...paymentRequest(envelope, "destination"),
      destination: address(300),
    }),
    "INVALID_INPUT",
  );
  await rejects(
    api.payments.createOrResume(orgId, {
      ...paymentRequest(envelope, "missing"),
      obligation_record_id: undefined,
    }),
    "INVALID_INPUT",
  );
  await rejects(
    api.payments.createOrResume(orgId, {
      ...paymentRequest(envelope, "generation"),
      approved_payee_generation_id: 999n,
    }),
    "INVALID_INPUT",
  );
  for (let i = 0; i < 2; i++)
    await rejects(
      api.payments.createOrResume(
        orgId,
        paymentRequest(envelope, `excess-${i}`, "101"),
      ),
      "BLOCKED",
    );
  assert.equal(
    (
      await database.db
        .select()
        .from(IdempotencyKey)
        .where(eq(IdempotencyKey.key, "excess-0"))
    ).length,
    0,
  );
});

test("invalid transitions and event failures roll back the whole operation", async () => {
  const orgId = envelope.org.organization.id;
  const payment = await api.payments.createOrResume(
    orgId,
    paymentRequest(envelope, "equivalent"),
  );
  await rejects(
    api.payments.transition(orgId, {
      payment_id: payment.id,
      expected_status: "DRAFT",
      to_status: "READY",
    }),
    "INVALID_TRANSITION",
  );
  await rejects(
    api.payments.transition(orgId, {
      payment_id: payment.id,
      expected_status: "DRAFT",
      to_status: "SETTLED",
    }),
    "INVALID_INPUT",
  );
  // Force an event-write failure in this disposable database to verify transaction rollback.
  await database.pool.query(
    "CREATE FUNCTION basin.reject_event_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture' USING ERRCODE='23514'; END $$",
  );
  await database.pool.query(
    "CREATE TRIGGER reject_event_fixture BEFORE INSERT ON basin.payment_event FOR EACH ROW EXECUTE FUNCTION basin.reject_event_fixture()",
  );
  try {
    await rejects(
      api.payments.transition(orgId, {
        payment_id: payment.id,
        expected_status: "DRAFT",
        to_status: "VALIDATING_AUTHORITY",
      }),
      "INVALID_INPUT",
    );
  } finally {
    await database.pool.query(
      "DROP TRIGGER reject_event_fixture ON basin.payment_event",
    );
  }
  assert.equal((await api.payments.read(orgId, payment.id)).status, "DRAFT");
  assert.equal((await api.payments.events(orgId, payment.id)).length, 1);
});

test("only Router-confirmed concurrent outcomes settle; immutable receipts retain authority", async () => {
  const orgId = envelope.org.organization.id;
  const winner = await api.payments.createOrResume(
    orgId,
    paymentRequest(envelope, "equivalent"),
  );
  const loser = await api.payments.createOrResume(
    orgId,
    paymentRequest(envelope, "contender"),
  );
  await Promise.all([
    executing(api, orgId, winner),
    executing(api, orgId, loser),
  ]);
  const evidence = settlementEvidence(envelope, winner);
  await rejects(
    api.receipts.finalizeFromRouter(orgId, { ...evidence }),
    "INVALID_INPUT",
  );
  await rejects(
    api.receipts.finalizeFromRouter(
      orgId,
      verified("settlement", {
        ...evidence,
        snapshot: {
          ...evidence.snapshot,
          obligation_remaining_after_base_units: "41",
        },
      }),
    ),
    "INVALID_INPUT",
  );
  assert.equal(
    (await database.db.select().from(PaymentAuthoritySnapshot)).length,
    0,
  );
  assert.equal((await api.payments.read(orgId, winner.id)).status, "EXECUTING");
  await Promise.all([
    api.receipts.finalizeFromRouter(orgId, evidence),
    api.payments.transition(orgId, {
      payment_id: loser.id,
      expected_status: "EXECUTING",
      to_status: "FAILED",
      reason: "OBLIGATION_CAPACITY_EXCEEDED",
    }),
  ]);
  const receipt = await api.receipts.read(orgId, winner.id);
  assert.equal(receipt.snapshot.obligation_remaining_after_base_units, "40");
  assert.equal(
    (await api.obligations.read(orgId, envelope.obligation.id))
      .remaining_amount_base_units,
    "40",
  );
  assert.equal((await api.payments.read(orgId, loser.id)).status, "FAILED");
  assert.equal(
    (await api.receipts.finalizeFromRouter(orgId, evidence)).id,
    receipt.receipt.id,
  );
  await rejects(
    api.payments.createOrResume(
      orgId,
      paymentRequest(envelope, "fresh-overspend", "60"),
    ),
    "BLOCKED",
  );
  await rejects(
    api.receipts.read(other.organization.id, winner.id),
    "NOT_FOUND",
  );
  await rejects(
    api.receipts.finalizeFromRouter(other.organization.id, evidence),
    "NOT_FOUND",
  );
  assert.equal("destination_ciphertext" in receipt.settlement, false);
  assert.equal("recipient_acceptance_signature" in receipt.activation, false);
  const events = await api.payments.events(orgId, winner.id);
  assert.deepEqual(
    events.map(({ event }) => event.sequence),
    [1, 2, 3, 4, 5],
  );
  for (const table of [
    ApprovedSecurityRoot,
    PaymentAuthoritySnapshot,
    Receipt,
  ]) {
    await assert.rejects(
      database.pool.query(
        `UPDATE basin."${table === Receipt ? "receipt" : table === ApprovedSecurityRoot ? "approved_security_root" : "payment_authority_snapshot"}" SET id = id`,
      ),
    );
    await assert.rejects(
      database.pool.query(
        `DELETE FROM basin."${table === Receipt ? "receipt" : table === ApprovedSecurityRoot ? "approved_security_root" : "payment_authority_snapshot"}"`,
      ),
    );
  }
  await assert.rejects(
    database.db.delete(Payment).where(eq(Payment.id, winner.id)),
  );
  await assert.rejects(
    database.db
      .update(Payment)
      .set({ status: "SETTLED", settled_at: new Date() })
      .where(eq(Payment.id, loser.id)),
  );
  const rotated = await api.relationships.appendSettlement(
    orgId,
    verified("settlementVersion", {
      approved_payee_generation_id: envelope.generation.id,
      approved_security_root_id: envelope.root.id,
      settlement_epoch: "1",
      commitment: hex(800),
      descriptor_version: 1,
      chain_id: 11155111,
      asset_address: address(200),
      valid_from: new Date(),
    }),
  );
  assert.equal(rotated.settlement_epoch, "1");
  assert.equal("destination_ciphertext" in rotated, false);
  const history = await api.relationships.history(
    orgId,
    envelope.relationship.id,
  );
  assert.equal(history.length, 2);
  assert.ok(history[0].settlement?.superseded_at);
  assert.equal(history[1].settlement?.superseded_at, null);
  await database.db
    .update(Workspace)
    .set({ display_name: "New organization name" })
    .where(eq(Workspace.id, envelope.org.workspace.id));
  await api.identities.appendAuthority(
    envelope.person.workspace.id,
    verified("identityAuthority", {
      basin_identity_id: envelope.person.identity.id,
      identity_epoch: "1",
      controller_address: address(500),
      identity_resolver_address: address(2),
      valid_from: new Date(),
      evidence_block_number: "30",
    }),
  );
  assert.equal(
    (await api.relationships.read(orgId, envelope.relationship.id)).status,
    "REAPPROVAL_REQUIRED",
  );
  assert.equal(
    (
      await api.identities.authorityHistory(
        envelope.person.workspace.id,
        envelope.person.identity.id,
      )
    ).length,
    2,
  );
  const historical = await api.receipts.read(orgId, winner.id);
  assert.deepEqual(historical.receipt, receipt.receipt);
  assert.deepEqual(historical.snapshot, receipt.snapshot);
  const reconnect = createPersistence(database.url);
  try {
    assert.deepEqual(
      (await reconnect.receipts.read(orgId, winner.id)).receipt,
      receipt.receipt,
    );
  } finally {
    await reconnect.close();
  }
});

test("terminal obligation projections cannot reactivate, increase, or accept destinations", async () => {
  for (const status of ["CONSUMED", "CANCELLED", "EXPIRED"] as const) {
    const org = await fixtureOrganization(
      api,
      `Terminal${status.toLowerCase()}`,
    );
    // Current identity changed in the preceding history test; fixture reload reflects verified state.
    const person = {
      ...envelope.person,
      identity: await api.identities.findByPayeeId(
        envelope.person.identity.payee_id,
      ),
    };
    const terminal = await fixtureEnvelope(
      api,
      org,
      person,
      status === "CONSUMED" ? 200 : status === "CANCELLED" ? 240 : 280,
    );
    if (status === "EXPIRED")
      await database.db
        .update(Obligation)
        .set({ valid_until: past })
        .where(eq(Obligation.id, terminal.obligation.id));
    await api.obligations.reconcileFromRouter(
      org.organization.id,
      verified("obligationProjection", {
        obligation_record_id: terminal.obligation.id,
        status,
        remaining_amount_base_units: status === "CONSUMED" ? "0" : "100",
      }),
    );
    for (const key of ["new-one", "new-two"])
      await rejects(
        api.payments.createOrResume(
          org.organization.id,
          paymentRequest(terminal, key, "1"),
        ),
        "BLOCKED",
      );
    await rejects(
      api.obligations.reconcileFromRouter(
        org.organization.id,
        verified("obligationProjection", {
          obligation_record_id: terminal.obligation.id,
          status: "ACTIVE" as const,
          remaining_amount_base_units: "100",
        }),
      ),
      "INVALID_TRANSITION",
    );
  }
  await rejects(
    api.obligations.reconcileFromRouter(
      envelope.org.organization.id,
      verified("obligationProjection", {
        obligation_record_id: envelope.obligation.id,
        status: "ACTIVE" as const,
        remaining_amount_base_units: "100",
      }),
    ),
    "INVALID_TRANSITION",
  );
  await rejects(
    api.obligations.reconcileFromRouter(
      envelope.org.organization.id,
      verified("obligationProjection", {
        obligation_record_id: envelope.obligation.id,
        status: "ACTIVE" as const,
        remaining_amount_base_units: "40",
        destination: address(1),
      }),
    ),
    "INVALID_INPUT",
  );
});

test("pending obligations require creation evidence before activation", async () => {
  const org = await fixtureOrganization(api, "Pendingcreation");
  const person = {
    ...envelope.person,
    identity: await api.identities.findByPayeeId(
      envelope.person.identity.payee_id,
    ),
  };
  const source = await fixtureEnvelope(api, org, person, 340);
  const { id, created_at, updated_at, ...fields } = source.obligation;
  void id;
  void created_at;
  void updated_at;
  const pending = await api.obligations.createFromRouter(
    org.organization.id,
    verified("obligation", {
      ...fields,
      obligation_id: hex(399),
      status: "PENDING" as const,
      creation_transaction_hash: null,
      creation_block_number: null,
      creation_log_index: null,
    }),
  );
  const projection = {
    obligation_record_id: pending.id,
    status: "ACTIVE" as const,
    remaining_amount_base_units: "100",
  };
  await rejects(
    api.obligations.reconcileFromRouter(
      org.organization.id,
      verified("obligationProjection", projection),
    ),
    "INVALID_INPUT",
  );
  const active = await api.obligations.reconcileFromRouter(
    org.organization.id,
    verified("obligationProjection", {
      ...projection,
      creation_transaction_hash: hex(400),
      creation_block_number: "50",
      creation_log_index: 1,
    }),
  );
  assert.equal(active.status, "ACTIVE");
  await rejects(
    api.obligations.reconcileFromRouter(
      org.organization.id,
      verified("obligationProjection", {
        ...projection,
        creation_transaction_hash: hex(401),
      }),
    ),
    "INVALID_INPUT",
  );
});

test("out-of-order confirmed Router settlements cannot resurrect cached capacity", async () => {
  const org = await fixtureOrganization(api, "Orderedresults");
  const person = {
    ...envelope.person,
    identity: await api.identities.findByPayeeId(
      envelope.person.identity.payee_id,
    ),
  };
  const source = await fixtureEnvelope(api, org, person, 440);
  const first = await api.payments.createOrResume(
    org.organization.id,
    paymentRequest(source, "first", "60"),
  );
  const second = await api.payments.createOrResume(
    org.organization.id,
    paymentRequest(source, "second", "40"),
  );
  await Promise.all([
    executing(api, org.organization.id, first),
    executing(api, org.organization.id, second),
  ]);
  // Ordered chain outcomes, deliberately delivered to Postgres in reverse order.
  await api.receipts.finalizeFromRouter(
    org.organization.id,
    settlementEvidence(source, second, "40", 950),
  );
  await api.receipts.finalizeFromRouter(
    org.organization.id,
    settlementEvidence(source, first, "100", 951),
  );
  const result = await api.obligations.read(
    org.organization.id,
    source.obligation.id,
  );
  assert.equal(result.status, "CONSUMED");
  assert.equal(result.remaining_amount_base_units, "0");
  assert.equal(
    (await api.receipts.read(org.organization.id, first.id)).snapshot
      .obligation_remaining_after_base_units,
    "40",
  );
  assert.equal(
    (await api.receipts.read(org.organization.id, second.id)).snapshot
      .obligation_remaining_after_base_units,
    "0",
  );
});

test("least-privilege runtime grants permit reads and reject deletion", async () => {
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("CREATE ROLE basin_runtime_fixture NOLOGIN");
    const grants = readFileSync("scripts/grant-runtime.sql", "utf8").replaceAll(
      ':"runtime_role"',
      '"basin_runtime_fixture"',
    );
    await client.query(grants);
    await client.query("SET LOCAL ROLE basin_runtime_fixture");
    assert.ok((await client.query("SELECT id FROM basin.payment")).rows.length);
    assert.equal(
      (await client.query("SELECT hash FROM drizzle.__drizzle_migrations")).rows
        .length,
      JSON.parse(readFileSync("src/migration-manifest.json", "utf8")).length,
    );
    await assert.rejects(
      client.query("DELETE FROM basin.payment"),
      (error: unknown) =>
        Boolean(
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "42501",
        ),
    );
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

test("database constraints reject cross-generation links and protect tenant relationships", async () => {
  const orgId = envelope.org.organization.id;
  const otherRelationship = await api.relationships.find(
    other.organization.id,
    envelope.person.identity.id,
  );
  await assert.rejects(
    database.db
      .update(Obligation)
      .set({ approved_payee_id: otherRelationship.id })
      .where(eq(Obligation.id, envelope.obligation.id)),
  );
  await assert.rejects(
    database.db
      .update(SettlementVersion)
      .set({ approved_security_root_id: 999n })
      .where(eq(SettlementVersion.id, envelope.settlement.id)),
  );
  await assert.rejects(
    database.db
      .delete(ApprovedPayeeGeneration)
      .where(eq(ApprovedPayeeGeneration.id, envelope.generation.id)),
  );
  assert.equal(
    (
      await database.db
        .select()
        .from(ApprovedPayee)
        .where(
          and(
            eq(ApprovedPayee.organization_id, orgId),
            eq(ApprovedPayee.basin_identity_id, envelope.person.identity.id),
          ),
        )
    ).length,
    1,
  );
  assert.equal((await database.db.select().from(BasinIdentity)).length, 1);
  assert.equal((await database.db.select().from(Receipt)).length, 3);
  assert.equal(
    (
      await database.db
        .select()
        .from(PaymentEvent)
        .where(eq(PaymentEvent.type, "SETTLEMENT_CONFIRMED"))
    ).length,
    3,
  );
});

test("health is safe, bounded, detects migration mismatch and recovers", async () => {
  assert.equal(await databaseHealth(database.url), "ok");
  const started = Date.now();
  assert.equal(
    await databaseHealth(
      "postgresql://unreachable:unreachable@127.0.0.1:1/missing",
    ),
    "unavailable",
  );
  assert.ok(Date.now() - started < 5000);
  assert.equal(await databaseHealth("not-a-database-url"), "unavailable");
  await database.pool.query(
    "UPDATE drizzle.__drizzle_migrations SET hash = 'fixture-mismatch'",
  );
  assert.equal(await databaseHealth(database.url), "migration_required");
  const { default: manifest } = await import("../src/migration-manifest.json");
  for (const migration of manifest)
    await database.pool.query(
      "UPDATE drizzle.__drizzle_migrations SET hash = $1 WHERE created_at = $2",
      [migration.hash, migration.when],
    );
  assert.equal(await databaseHealth(database.url), "ok");
});
