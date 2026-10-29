import { z } from 'zod';

const envSchema = z.object({
  MONGODB_URI: z.string().min(1),
  MONGODB_DB: z.string().min(1),
  MCP_COLLECTION_ALLOWLIST: z
    .string()
    .optional()
    .transform((raw) => {
      const names = (raw ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
      return names.length > 0 ? names : undefined;
    }),
  MCP_MAX_TIME_MS: z.coerce.number().int().positive().default(5000),
});

export type Env = z.output<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment configuration: ${problems.join('; ')}`);
  }
  return parsed.data;
}
