import { z } from "zod";

export const localRuntimeStateSchema = z.object({
	pid: z.number().int().positive(),
	services: z.array(z.object({ name: z.enum(["api", "app", "agent"]), pid: z.number().int().positive() })),
});
