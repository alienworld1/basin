import { displayName } from "@basin/domain";
import { z } from "zod";

export const workspaceRequest = z
  .object({
    type: z.enum(["PERSONAL", "ORGANIZATION"]),
    displayName,
  })
  .strict();
