import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(2567),
  LOG_LEVEL: z.string().default("info"),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(14),
  DATABASE_URL: z.string().optional(),
  CORS_ORIGINS: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // Throw a readable error
    throw new Error("Invalid environment variables: " + parsed.error.message);
  }

  const env = parsed.data;
  if (env.NODE_ENV === "production" && !env.DATABASE_URL) {
    throw new Error("Invalid environment variables: DATABASE_URL is required in production.");
  }
  if (env.NODE_ENV === "production" && !env.CORS_ORIGINS) {
    throw new Error("Invalid environment variables: CORS_ORIGINS is required in production.");
  }

  return env;
}
