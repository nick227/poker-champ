import { z } from "zod";

export const VisibilityEnum = z.enum(["PUBLIC", "PRIVATE"]);

export const CreateTableSchema = z
  .object({
    name: z.string().min(1).max(80).default("Hold'em"),
    maxSeats: z.number().int().min(2).max(10),
    smallBlindCents: z.number().int().positive().default(100),
    bigBlindCents: z.number().int().positive().default(200),
    minBuyInCents: z.number().int().positive().default(2000),
    maxBuyInCents: z.number().int().positive().default(20000),
    visibility: VisibilityEnum.default("PUBLIC"),
    password: z.string().min(1).max(64).optional(),
    speed: z.enum(["normal", "fast"]).default("normal"),
  })
  .superRefine((v, ctx) => {
    if (v.bigBlindCents < v.smallBlindCents) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bigBlindCents"], message: "bigBlindCents must be >= smallBlindCents" });
    }
    if (v.maxBuyInCents < v.minBuyInCents) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["maxBuyInCents"], message: "maxBuyInCents must be >= minBuyInCents" });
    }
    if (v.visibility === "PRIVATE" && !v.password) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["password"], message: "password is required for PRIVATE tables" });
    }
    if (v.visibility === "PUBLIC" && v.password) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["password"], message: "password should not be provided for PUBLIC tables" });
    }
  });

export const JoinTableSchema = z.object({
  tableId: z.string().min(1),
  password: z.string().min(1).max(64).optional(),
});

export type CreateTableInput = z.infer<typeof CreateTableSchema>;
export type JoinTableInput = z.infer<typeof JoinTableSchema>;
