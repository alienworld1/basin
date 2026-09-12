import {
  BASIN_SEPOLIA_V1,
  BasinSdkError,
  createBasinClient,
  decodeBasinEvent,
  type BasinClientConfig,
} from "basin-sdk";

declare const config: BasinClientConfig;
const client = createBasinClient(config);
client.identity.normalize("ledger.basin.eth");
void client.obligations.get(
  "0x0000000000000000000000000000000000000000000000000000000000000000",
);
void BASIN_SEPOLIA_V1;
void BasinSdkError;
void decodeBasinEvent;
