import { z } from "zod";

export const TableActionEnum = z.enum(["FOLD", "CHECK", "CALL", "BET", "RAISE", "ALL_IN"]);

export const ActionPayloadSchema = z
  .object({
    action: TableActionEnum,
    amountCents: z.number().int().nonnegative().optional(),
  })
  .superRefine((val, ctx) => {
    const needsAmount = val.action === "BET" || val.action === "RAISE";
    if (needsAmount && (val.amountCents === undefined || val.amountCents <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amountCents"],
        message: `${val.action} requires amountCents > 0`,
      });
    }
    if (!needsAmount && val.amountCents !== undefined && val.amountCents !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amountCents"],
        message: `${val.action} should not include amountCents`,
      });
    }
  });

export type TableAction = z.infer<typeof TableActionEnum>;
export type ActionPayload = z.infer<typeof ActionPayloadSchema>;
