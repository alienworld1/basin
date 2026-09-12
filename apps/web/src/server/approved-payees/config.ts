import "server-only";

import { getAddress } from "viem";

import { sepoliaActivationDeployment } from "@basin/contracts";
import { getEnsServerEnvironment } from "../config/environment";

export function approvedPayeeConfiguration() {
  const ens = getEnsServerEnvironment();
  return {
    ens,
    activation: {
      address: getAddress(sepoliaActivationDeployment.routerAddress),
      version: sepoliaActivationDeployment.version,
    },
  };
}
