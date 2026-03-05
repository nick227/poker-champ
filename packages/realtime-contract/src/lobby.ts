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
    showStats: z.boolean().default(false),
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

export const OnlinePlayerTableSchema = z.object({
  tableId: z.string().min(1),
  tableName: z.string().min(1),
});

export const OnlinePlayerLocationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("LOBBY") }),
  z.object({
    kind: z.literal("TABLE"),
    tableId: z.string().min(1),
    tableName: z.string().min(1),
  }),
  z.object({
    kind: z.literal("MULTI_TABLE"),
    tables: z.array(OnlinePlayerTableSchema).min(2),
  }),
]);

export const OnlinePlayerSummarySchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().min(1),
  initials: z.string().min(1).max(4),
  location: OnlinePlayerLocationSchema,
});

export type CreateTableInput = z.infer<typeof CreateTableSchema>;
export type JoinTableInput = z.infer<typeof JoinTableSchema>;
export type OnlinePlayerTable = z.infer<typeof OnlinePlayerTableSchema>;
export type OnlinePlayerLocation = z.infer<typeof OnlinePlayerLocationSchema>;
export type OnlinePlayerSummary = z.infer<typeof OnlinePlayerSummarySchema>;
