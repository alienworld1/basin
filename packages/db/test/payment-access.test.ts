import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { DomainError } from "@basin/domain";

import { createPersistence } from "../src/index";
import {
  OrganizationAccessEvent,
  OrganizationMember,
} from "../src/schema/tables";
import { isolatedDatabase } from "./database";
import { fixtureOrganization } from "./fixtures";

let database: Awaited<ReturnType<typeof isolatedDatabase>>;
let api: ReturnType<typeof createPersistence>;

before(async () => {
  database = await isolatedDatabase();
  await database.migrate();
  api = createPersistence(database.url);
});

after(async () => {
  await api?.close();
  await database?.dispose();
});

test("operator access is removed, reactivated on the same row, and left durably", async () => {
  const organization = await fixtureOrganization(api, "Access Acme");
  const operator = await api.workspaces.findOrCreateUser({
    privy_user_id: "fixture:operator",
  });
  const invite = await api.paymentAccess.createInvitation({
    organizationId: organization.organization.id,
    actorUserId: organization.user.id,
    inviteeLabel: "Jordan Lee",
    secretHash: `0x${"11".repeat(32)}`,
    idempotencyKey: "create-invitation-key-0001",
    requestFingerprint: `0x${"22".repeat(32)}`,
    expiresAt: new Date(Date.now() + 60_000),
  });
  assert.equal(
    (await api.paymentAccess.accept(invite.secret_hash, operator.id)).outcome,
    "NAME_REQUIRED",
  );
  const accepted = await api.paymentAccess.accept(
    invite.secret_hash,
    operator.id,
    "Jordan Lee",
  );
  assert.equal(accepted.outcome, "ACCEPTED");
  assert.equal(
    (await api.paymentAccess.accept(invite.secret_hash, operator.id)).outcome,
    "ALREADY_ACCEPTED",
  );
  const [firstMembership] = await database.db
    .select()
    .from(OrganizationMember)
    .where(
      and(
        eq(OrganizationMember.organization_id, organization.organization.id),
        eq(OrganizationMember.user_id, operator.id),
      ),
    );
  await api.paymentAccess.removeOperator(
    organization.organization.id,
    firstMembership.id,
    organization.user.id,
  );
  await assert.rejects(
    api.workspaces.readWorkspace(operator.id, organization.workspace.id),
    (error) => error instanceof DomainError && error.code === "NOT_FOUND",
  );

  const reinvite = await api.paymentAccess.createInvitation({
    organizationId: organization.organization.id,
    actorUserId: organization.user.id,
    inviteeLabel: "Jordan Lee",
    secretHash: `0x${"33".repeat(32)}`,
    idempotencyKey: "create-invitation-key-0002",
    requestFingerprint: `0x${"44".repeat(32)}`,
    expiresAt: new Date(Date.now() + 60_000),
  });
  assert.equal(
    (await api.paymentAccess.accept(reinvite.secret_hash, operator.id)).outcome,
    "ACCEPTED",
  );
  const [reactivated] = await database.db
    .select()
    .from(OrganizationMember)
    .where(eq(OrganizationMember.id, firstMembership.id));
  assert.equal(reactivated.status, "ACTIVE");

  await api.paymentAccess.leaveOrganization(
    organization.organization.id,
    operator.id,
  );
  const [left] = await database.db
    .select()
    .from(OrganizationMember)
    .where(eq(OrganizationMember.id, firstMembership.id));
  assert.equal(left.status, "LEFT");
  const events = await database.db
    .select()
    .from(OrganizationAccessEvent)
    .where(
      eq(OrganizationAccessEvent.organization_id, organization.organization.id),
    );
  assert.deepEqual(
    events.map((event) => event.type),
    ["INVITED", "JOINED", "REMOVED", "INVITED", "REINSTATED", "LEFT"],
  );
});

test("expired and revoked invitations cannot grant access", async () => {
  const organization = await fixtureOrganization(api, "Expiry Acme");
  const operator = await api.workspaces.findOrCreateUser({
    privy_user_id: "fixture:expiry-operator",
    display_name: "Taylor",
  });
  const expired = await api.paymentAccess.createInvitation({
    organizationId: organization.organization.id,
    actorUserId: organization.user.id,
    inviteeLabel: "Taylor",
    secretHash: `0x${"55".repeat(32)}`,
    idempotencyKey: "create-expired-key-000001",
    requestFingerprint: `0x${"66".repeat(32)}`,
    expiresAt: new Date(Date.now() - 1_000),
  });
  assert.equal(
    (await api.paymentAccess.accept(expired.secret_hash, operator.id)).outcome,
    "EXPIRED",
  );
  const revoked = await api.paymentAccess.createInvitation({
    organizationId: organization.organization.id,
    actorUserId: organization.user.id,
    inviteeLabel: "Taylor",
    secretHash: `0x${"77".repeat(32)}`,
    idempotencyKey: "create-revoked-key-000001",
    requestFingerprint: `0x${"88".repeat(32)}`,
    expiresAt: new Date(Date.now() + 60_000),
  });
  await api.paymentAccess.revokeInvitation(revoked.id, organization.user.id);
  assert.equal(
    (await api.paymentAccess.accept(revoked.secret_hash, operator.id)).outcome,
    "REVOKED",
  );
});

test("concurrent invitations activate one durable organization membership", async () => {
  const organization = await fixtureOrganization(api, "Concurrency Acme");
  const operator = await api.workspaces.findOrCreateUser({
    privy_user_id: "fixture:concurrent-operator",
    display_name: "Morgan",
  });
  const invitations = await Promise.all(
    ["99", "aa"].map((byte, index) =>
      api.paymentAccess.createInvitation({
        organizationId: organization.organization.id,
        actorUserId: organization.user.id,
        inviteeLabel: "Morgan",
        secretHash: `0x${byte.repeat(32)}`,
        idempotencyKey: `create-concurrent-key-000${index}`,
        requestFingerprint: `0x${(index === 0 ? "bb" : "cc").repeat(32)}`,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ),
  );

  const outcomes = await Promise.all(
    invitations.map((invitation) =>
      api.paymentAccess.accept(invitation.secret_hash, operator.id),
    ),
  );
  assert.equal(
    outcomes.filter((result) => result.outcome === "ACCEPTED").length,
    1,
  );
  assert.equal(
    outcomes.filter((result) => result.outcome === "ALREADY_MEMBER").length,
    1,
  );

  const memberships = await database.db
    .select()
    .from(OrganizationMember)
    .where(
      and(
        eq(OrganizationMember.organization_id, organization.organization.id),
        eq(OrganizationMember.user_id, operator.id),
      ),
    );
  assert.equal(memberships.length, 1);
  assert.equal(memberships[0].status, "ACTIVE");
});
