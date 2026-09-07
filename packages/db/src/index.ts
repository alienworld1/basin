import "server-only";
import { connectDatabase } from "./client";
import { workspaceRepository } from "./repositories/workspaces";
import { identityRepository } from "./repositories/identities";
import { relationshipRepository } from "./repositories/relationships";
import { obligationRepository } from "./repositories/obligations";
import { paymentRepository } from "./repositories/payments";
import { receiptRepository } from "./repositories/receipts";
export { databaseHealth } from "./health";
export type { DatabaseHealth } from "./health";
export type * from "./evidence";
export { attestInitialIdentity } from "./evidence-registry";

export function createPersistence(connectionString: string) {
  const connection = connectDatabase(connectionString);
  return {
    workspaces: workspaceRepository(connection.db),
    identities: identityRepository(connection.db),
    relationships: relationshipRepository(connection.db),
    obligations: obligationRepository(connection.db),
    payments: paymentRepository(connection.db),
    receipts: receiptRepository(connection.db),
    close: connection.close,
  };
}
