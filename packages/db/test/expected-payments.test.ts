import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { and, count, eq } from "drizzle-orm";
import { DomainError } from "@basin/domain";

import { createPersistence } from "../src/index";
import { ExpectedPayment, OrganizationMember } from "../src/schema/tables";
import { isolatedDatabase } from "./database";
import {
  address,
  fixtureEnvelope,
  fixtureIdentity,
  fixtureOrganization,
  type Envelope,
  type Persistence,
} from "./fixtures";

let database: Awaited<ReturnType<typeof isolatedDatabase>>;
let api: Persistence;
let envelope: Envelope;
let administratorId: bigint;

const rejects = (operation: Promise<unknown>, code: string) =>
  assert.rejects(
    operation,
    (error) => error instanceof DomainError && error.code === code,
  );

before(async () => {
  database = await isolatedDatabase();
  await database.migrate();
  api = createPersistence(database.url);
  const person = await fixtureIdentity(api);
  const organization = await fixtureOrganization(api, "Expected Acme");
  envelope = await fixtureEnvelope(api, organization, person, 300);
  [administratorId] = (
    await database.db
      .select({ id: OrganizationMember.id })
      .from(OrganizationMember)
      .where(
        and(
          eq(OrganizationMember.organization_id, organization.organization.id),
          eq(OrganizationMember.user_id, organization.user.id),
        ),
      )
  ).map((row) => row.id);
});

after(async () => {
  await api?.close();
  await database?.dispose();
});

function createInput(key: string) {
  return {
    organization_id: envelope.org.organization.id,
    approved_payee_id: envelope.relationship.id,
    approved_payee_generation_id: envelope.generation.id,
    amount_base_units: "100",
    asset_address: address(200),
    purpose: "Design services",
    external_reference: "INV-01",
    created_by_member_id: administratorId,
    idempotency_key: key,
  };
}

test("creation is tenant-bound, immutable, and idempotent under concurrency", async () => {
  const key = "3d0feb60-b17d-48e0-bcff-e1c26653e90c";
  const results = await Promise.all([
    api.expectedPayments.create(createInput(key)),
    api.expectedPayments.create(createInput(key)),
  ]);
  assert.equal(results[0].payment.id, results[1].payment.id);
  assert.equal(results.filter((result) => result.created).length, 1);
  await rejects(
    api.expectedPayments.create({ ...createInput(key), purpose: "Different" }),
    "CONFLICT",
  );
  const [{ value }] = await database.db
    .select({ value: count() })
    .from(ExpectedPayment)
    .where(eq(ExpectedPayment.id, results[0].payment.id));
  assert.equal(value, 1);
});

test("payer and actual payee can read the same object without cross-tenant access", async () => {
  const result = await api.expectedPayments.create(
    createInput("4334e02e-8098-4e25-b7f0-5954de45c9cc"),
  );
  assert.equal(
    (
      await api.expectedPayments.listForOrganization(
        envelope.org.organization.id,
      )
    )[0].expectedPayment.id,
    result.payment.id,
  );
  assert.equal(
    (
      await api.expectedPayments.listForPersonalWorkspace(
        envelope.person.workspace.id,
      )
    )[0].expectedPayment.id,
    result.payment.id,
  );
  const outsider = await fixtureOrganization(api, "Expected Outsider");
  await rejects(
    api.expectedPayments.detailForOrganization(
      outsider.organization.id,
      result.payment.id,
    ),
    "NOT_FOUND",
  );
});

test("cancellation is terminal while matching verified evidence alone can advance", async () => {
  const cancelled = await api.expectedPayments.create(
    createInput("12a61658-5864-468e-9d79-26c7fb268f73"),
  );
  const cancellation = {
    organization_id: envelope.org.organization.id,
    expected_payment_id: cancelled.payment.id,
    member_id: administratorId,
    idempotency_key: "02a764c1-fe9f-488e-851a-9b2490e4a05c",
  };
  assert.equal(
    (await api.expectedPayments.cancel(cancellation)).status,
    "CANCELLED",
  );
  assert.equal(
    (await api.expectedPayments.cancel(cancellation)).status,
    "CANCELLED",
  );
  await rejects(
    api.expectedPayments.linkObligation({
      organization_id: envelope.org.organization.id,
      expected_payment_id: cancelled.payment.id,
      obligation_record_id: envelope.obligation.id,
      canonical_metadata_hash: envelope.obligation.metadata_hash,
    }),
    "INVALID_INPUT",
  );

  const ready = await api.expectedPayments.create(
    createInput("87f290f4-5efa-44f0-942f-66bbd71970b6"),
  );
  await rejects(
    api.expectedPayments.linkObligation({
      organization_id: envelope.org.organization.id,
      expected_payment_id: ready.payment.id,
      obligation_record_id: envelope.obligation.id,
      canonical_metadata_hash: `0x${"ff".repeat(32)}`,
    }),
    "INVALID_INPUT",
  );
  assert.equal(
    (
      await api.expectedPayments.linkObligation({
        organization_id: envelope.org.organization.id,
        expected_payment_id: ready.payment.id,
        obligation_record_id: envelope.obligation.id,
        canonical_metadata_hash: envelope.obligation.metadata_hash,
      })
    ).status,
    "READY",
  );
  await rejects(
    api.expectedPayments.cancel({
      ...cancellation,
      expected_payment_id: ready.payment.id,
      idempotency_key: "563f20af-fabc-4fde-b590-29c17c13506a",
    }),
    "CONFLICT",
  );
});
