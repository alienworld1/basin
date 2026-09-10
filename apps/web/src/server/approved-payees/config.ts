import "server-only";

import { sepoliaActivationDeployment } from "@basin/contracts";
import { getAddress } from "viem";
import { z } from "zod";

import { getEnsServerEnvironment } from "../config/environment";

export function approvedPayeeConfiguration() {
  const ens = getEnsServerEnvironment();
  const router = z
    .object({ address: z.string(), version: z.literal("1") })
    .safeParse({
      address:
        process.env.BASIN_ACTIVATION_ROUTER_ADDRESS?.trim() ??
        sepoliaActivationDeployment.routerAddress,
      version:
        process.env.BASIN_ACTIVATION_ROUTER_VERSION?.trim() ??
        sepoliaActivationDeployment.version,
    });
  return {
    ens,
    activation: router.success
      ? {
          address: getAddress(router.data.address),
          version: router.data.version,
        }
      : null,
  };
}
