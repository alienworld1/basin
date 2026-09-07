import { getAddress } from "viem";

import { createEnsAdapter } from "../src/index";
import { readLiveEnvironment } from "./environment";

const [name, controller] = process.argv.slice(2);
if (!name || !controller) {
  throw new Error("Pass the full Basin identity and expected controller.");
}
const state = await createEnsAdapter(readLiveEnvironment()).verifyIdentity(
  name,
  getAddress(controller),
);
process.stdout.write(
  `${JSON.stringify({
    name: state.name,
    controller: state.controllerAddress,
    resolver: state.resolverAddress,
    recordVersion: state.recordVersion,
    identityEpoch: state.identityEpoch,
    blockNumber: state.blockNumber,
    transferDisabled: state.permissionProfile.transferDisabled,
    profileValid: state.profileValid,
  })}\n`,
);
