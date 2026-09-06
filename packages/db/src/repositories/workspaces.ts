import { and, asc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { recordId } from "@basin/domain";
import {
  User,
  Workspace,
  Organization,
  OrganizationMember,
} from "../schema/tables";
import { userInput, workspaceInput, organizationMemberInput } from "../inputs";
import type { Database } from "../client";
import { found, requireMatch, safely } from "../errors";

export function workspaceRepository(db: Database) {
  return {
    findOrCreateUser(input: unknown) {
      return safely(async () => {
        const values = userInput.parse(input);
        const [row] = await db
          .insert(User)
          .values(values)
          .onConflictDoUpdate({
            target: User.privy_user_id,
            set: { privy_user_id: values.privy_user_id },
          })
          .returning();
        return found(row);
      });
    },
    findUser(privyUserId: string) {
      return safely(async () => {
        const subject = z.string().trim().min(1).max(240).parse(privyUserId);
        return found(
          (
            await db.select().from(User).where(eq(User.privy_user_id, subject))
          )[0],
        );
      });
    },
    createWorkspace(input: unknown) {
      return safely(async () => {
        const values = workspaceInput.parse(input);
        return found(
          (await db.insert(Workspace).values(values).returning())[0],
        );
      });
    },
    createPersonalWorkspace(userId: bigint, displayName: string) {
      return safely(async () => {
        recordId.parse(userId);
        const values = workspaceInput.parse({
          type: "PERSONAL",
          display_name: displayName,
          owner_user_id: userId,
        });
        return db.transaction(async (tx) => {
          await tx
            .update(User)
            .set({ display_name: values.display_name, updated_at: new Date() })
            .where(and(eq(User.id, userId), isNull(User.display_name)));
          return found(
            (await tx.insert(Workspace).values(values).returning())[0],
          );
        });
      });
    },
    createOrganizationWorkspace(userId: bigint, displayName: string) {
      return safely(async () => {
        recordId.parse(userId);
        const values = workspaceInput.parse({
          type: "ORGANIZATION",
          display_name: displayName,
          owner_user_id: userId,
        });
        return db.transaction(async (tx) => {
          const workspace = found(
            (await tx.insert(Workspace).values(values).returning())[0],
          );
          const organization = found(
            (
              await tx
                .insert(Organization)
                .values({ workspace_id: workspace.id })
                .returning()
            )[0],
          );
          await tx.insert(OrganizationMember).values({
            organization_id: organization.id,
            user_id: userId,
            role: "ADMIN",
          });
          return workspace;
        });
      });
    },
    listAccessibleWorkspaces(userId: bigint) {
      return safely(async () => {
        recordId.parse(userId);
        const rows = await db
          .select({
            workspace: Workspace,
            memberRole: OrganizationMember.role,
          })
          .from(Workspace)
          .leftJoin(Organization, eq(Organization.workspace_id, Workspace.id))
          .leftJoin(
            OrganizationMember,
            and(
              eq(OrganizationMember.organization_id, Organization.id),
              eq(OrganizationMember.user_id, userId),
            ),
          )
          .where(
            or(
              and(
                eq(Workspace.type, "PERSONAL"),
                eq(Workspace.owner_user_id, userId),
              ),
              and(
                eq(Workspace.type, "ORGANIZATION"),
                eq(OrganizationMember.user_id, userId),
              ),
            ),
          )
          .orderBy(asc(Workspace.created_at), asc(Workspace.id));
        return rows.map(({ workspace, memberRole }) => ({
          id: workspace.id.toString(),
          name: workspace.display_name,
          type:
            workspace.type === "PERSONAL"
              ? ("personal" as const)
              : ("organization" as const),
          role:
            workspace.type === "PERSONAL"
              ? ("OWNER" as const)
              : found(memberRole),
        }));
      });
    },
    readWorkspaceAccess(userId: bigint, workspaceId: bigint) {
      return safely(async () => {
        recordId.parse(userId);
        recordId.parse(workspaceId);
        const [row] = await db
          .select({
            workspace: Workspace,
            organizationId: Organization.id,
            memberRole: OrganizationMember.role,
          })
          .from(Workspace)
          .leftJoin(Organization, eq(Organization.workspace_id, Workspace.id))
          .leftJoin(
            OrganizationMember,
            and(
              eq(OrganizationMember.organization_id, Organization.id),
              eq(OrganizationMember.user_id, userId),
            ),
          )
          .where(
            and(
              eq(Workspace.id, workspaceId),
              or(
                and(
                  eq(Workspace.type, "PERSONAL"),
                  eq(Workspace.owner_user_id, userId),
                ),
                and(
                  eq(Workspace.type, "ORGANIZATION"),
                  eq(OrganizationMember.user_id, userId),
                ),
              ),
            ),
          );
        const match = found(row);
        return match;
      });
    },
    readWorkspace(userId: bigint, workspaceId: bigint) {
      return safely(async () => {
        recordId.parse(userId);
        recordId.parse(workspaceId);
        const [row] = await db
          .select({ workspace: Workspace })
          .from(Workspace)
          .leftJoin(Organization, eq(Organization.workspace_id, Workspace.id))
          .leftJoin(
            OrganizationMember,
            and(
              eq(OrganizationMember.organization_id, Organization.id),
              eq(OrganizationMember.user_id, userId),
            ),
          )
          .where(
            and(
              eq(Workspace.id, workspaceId),
              or(
                and(
                  eq(Workspace.type, "PERSONAL"),
                  eq(Workspace.owner_user_id, userId),
                ),
                and(
                  eq(Workspace.type, "ORGANIZATION"),
                  eq(OrganizationMember.user_id, userId),
                ),
              ),
            ),
          );
        return found(row).workspace;
      });
    },
    createOrganization(ownerUserId: bigint, workspaceId: bigint) {
      return safely(async () => {
        recordId.parse(ownerUserId);
        recordId.parse(workspaceId);
        return db.transaction(async (tx) => {
          const workspace = found(
            (
              await tx
                .select()
                .from(Workspace)
                .where(
                  and(
                    eq(Workspace.id, workspaceId),
                    eq(Workspace.owner_user_id, ownerUserId),
                  ),
                )
                .for("update")
            )[0],
          );
          requireMatch(workspace.type === "ORGANIZATION");
          const organization = found(
            (
              await tx
                .insert(Organization)
                .values({ workspace_id: workspaceId })
                .onConflictDoUpdate({
                  target: Organization.workspace_id,
                  set: { workspace_id: workspaceId },
                })
                .returning()
            )[0],
          );
          await tx
            .insert(OrganizationMember)
            .values({
              organization_id: organization.id,
              user_id: ownerUserId,
              role: "ADMIN",
            })
            .onConflictDoNothing();
          return organization;
        });
      });
    },
    addMember(organizationId: bigint, input: unknown) {
      return safely(async () => {
        recordId.parse(organizationId);
        const values = organizationMemberInput
          .omit({ organization_id: true })
          .parse(input);
        // Role changes require a separate authorized workflow; retries never escalate an existing member.
        return found(
          (
            await db
              .insert(OrganizationMember)
              .values({ ...values, organization_id: organizationId })
              .onConflictDoUpdate({
                target: [
                  OrganizationMember.organization_id,
                  OrganizationMember.user_id,
                ],
                set: { user_id: values.user_id },
              })
              .returning()
          )[0],
        );
      });
    },
    readMember(organizationId: bigint, userId: bigint) {
      return safely(async () => {
        recordId.parse(organizationId);
        recordId.parse(userId);
        return found(
          (
            await db
              .select()
              .from(OrganizationMember)
              .where(
                and(
                  eq(OrganizationMember.organization_id, organizationId),
                  eq(OrganizationMember.user_id, userId),
                ),
              )
          )[0],
        );
      });
    },
  };
}
