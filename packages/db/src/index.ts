import "server-only";
import { receivingRepository } from "./repositories/receiving";
import { connectRuntimeDatabase } from "./client";
import { workspaceRepository } from "./repositories/workspaces";
import { identityRepository } from "./repositories/identities";
import { relationshipRepository } from "./repositories/relationships";
import { obligationRepository } from "./repositories/obligations";
import { paymentRepository } from "./repositories/payments";
import { receiptRepository } from "./repositories/receipts";
import { treasuryRepository } from "./repositories/treasury";
import { paymentAccessRepository } from "./repositories/payment-access";
import { approvedPayeeRepository } from "./repositories/approved-payees";
export { databaseHealth } from "./health";
export type { DatabaseHealth } from "./health";
export type * from "./evidence";
export {
  attestInitialIdentity,
  attestSettlementVersion,
  attestGeneration,
  attestActivation,
  attestRelationshipEnd,
} from "./evidence-registry";

export function createPersistence(connectionString: string) {
  const connection = connectRuntimeDatabase(connectionString);
  return {
    workspaces: workspaceRepository(connection.db),
    receiving: receivingRepository(connection.db),
    identities: identityRepository(connection.db),
    relationships: relationshipRepository(connection.db),
    obligations: obligationRepository(connection.db),
    payments: paymentRepository(connection.db),
    receipts: receiptRepository(connection.db),
    treasury: treasuryRepository(connection.db),
    paymentAccess: paymentAccessRepository(connection.db),
    approvedPayees: approvedPayeeRepository(connection.db),
    close: connection.close,
  };
}
