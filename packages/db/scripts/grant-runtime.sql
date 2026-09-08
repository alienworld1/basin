-- Run with psql -v runtime_role=YOUR_EXISTING_APPLICATION_ROLE -f scripts/grant-runtime.sql.
-- Create and manage the login/password through your deployment's secret provisioning.
GRANT USAGE ON SCHEMA basin TO :"runtime_role";
GRANT SELECT ON ALL TABLES IN SCHEMA basin TO :"runtime_role";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA basin TO :"runtime_role";
GRANT INSERT ON ALL TABLES IN SCHEMA basin TO :"runtime_role";
GRANT UPDATE ON basin."user", basin.workspace, basin.organization, basin.organization_member,
  basin.basin_identity, basin.approved_payee, basin.obligation, basin.payment,
  basin.idempotency_key, basin.receiving_preference, basin.settlement_operation,
  basin.organization_treasury, basin.privy_provisioning_operation,
  basin.privy_webhook_receipt, basin.routine_signer_secret TO :"runtime_role";
GRANT UPDATE (superseded_at) ON basin.identity_authority_version, basin.settlement_version TO :"runtime_role";
GRANT UPDATE (ended_at, end_reason) ON basin.approved_payee_generation TO :"runtime_role";
GRANT USAGE ON SCHEMA drizzle TO :"runtime_role";
GRANT SELECT ON drizzle.__drizzle_migrations TO :"runtime_role";
