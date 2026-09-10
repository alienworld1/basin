import "server-only";

import { getAddress } from "viem";
import { z } from "zod";

import { getEnsServerEnvironment } from "../config/environment";
import { basinRouterManifest } from "../config/basin-router-manifest";

export function approvedPayeeConfiguration() {
  const ens = getEnsServerEnvironment();
  const router = z
    .object({
      address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
      version: z.literal("1"),
    })
    .safeParse(basinRouterManifest);
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
