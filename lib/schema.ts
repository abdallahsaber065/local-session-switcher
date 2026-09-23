import { z } from 'zod';
import { AuthRecipeSchema, SameSiteSchema } from './auth/schema';

export { SameSiteSchema, AuthRecipeSchema };

export const CookieSchema = z.object({
  name: z.string().min(1),
  value: z.string(),
  /** Only set for non-hostOnly cookies; hostOnly cookies replay without a domain. */
  domain: z.string().optional(),
  path: z.string().default('/'),
  hostOnly: z.boolean().default(true),
  httpOnly: z.boolean().default(false),
  secure: z.boolean().default(false),
  sameSite: SameSiteSchema.default('unspecified'),
  expirationDate: z.number().optional(),
});

export const ClearCookiesSchema = z.union([
  z.literal('all'),
  z.object({ names: z.array(z.string()) }),
  z.object({ prefixes: z.array(z.string()) }),
]);

export const ClearStorageSchema = z.union([
  z.literal('all'),
  z.object({ mode: z.literal('all'), exclude: z.array(z.string()).default([]) }),
  z.object({ mode: z.literal('keys'), keys: z.array(z.string()) }),
]);

export const OriginStorageSchema = z.object({
  localStorage: z.record(z.string(), z.string()).default({}),
  sessionStorage: z.record(z.string(), z.string()).default({}),
});

export const TagSchema = z.object({
  name: z.string().min(1),
  color: z.string().default('#64748b'),
});

export const CredentialsSchema = z.object({
  username: z.string().default(''),
  password: z.string().default(''),
  extra: z.record(z.string(), z.string()).default({}),
});

/** Tokens and variables the extension obtained from the project's auth recipe. */
export const CachedSessionSchema = z.object({
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  vars: z.record(z.string(), z.string()).default({}),
  obtainedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  source: z.enum(['login', 'refresh', 'capture']).optional(),
});

export const UserSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  tags: z.array(z.string()).default([]),
  notes: z.string().default(''),
  cookies: z.array(CookieSchema).default([]),
  storage: z.record(z.string(), OriginStorageSchema).default({}),
  credentials: CredentialsSchema.default({ username: '', password: '', extra: {} }),
  session: CachedSessionSchema.default({ vars: {} }),
  capturedAt: z.string().optional(),
  lastUsedAt: z.string().optional(),
});

/** Accepts and normalizes an origin like `http://localhost:3000` (path/trailing slash rejected). */
export const OriginSchema = z.string().transform((raw, ctx) => {
  const norm = raw.trim().replace(/\/+$/, '');
  try {
    const url = new URL(norm);
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin === norm) {
      return norm;
    }
  } catch {
    // fall through to issue
  }
  ctx.addIssue({ code: 'custom', message: 'Must be an origin like http://localhost:3000 (no path)' });
  return z.NEVER;
});

export const ClearSchema = z.object({
  cookies: ClearCookiesSchema.default('all'),
  localStorage: ClearStorageSchema.default({ mode: 'all', exclude: [] }),
  sessionStorage: ClearStorageSchema.default({ mode: 'all', exclude: [] }),
});

export const ProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  origins: z.array(OriginSchema).min(1),
  tags: z.array(TagSchema).default([]),
  auth: AuthRecipeSchema.optional(),
  clear: ClearSchema.default({
    cookies: 'all',
    localStorage: { mode: 'all', exclude: [] },
    sessionStorage: { mode: 'all', exclude: [] },
  }),
  reload: z.enum(['matching-tabs', 'active-tab', 'none']).default('matching-tabs'),
  users: z.array(UserSchema).default([]),
});

export const StateSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  activeProjectId: z.string().nullable().default(null),
  activeUserByProject: z.record(z.string(), z.string()).default({}),
  projects: z.array(ProjectSchema).default([]),
});

export const SeedUserSchema = UserSchema.partial({ id: true });

export const SeedProjectSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  origins: z.array(OriginSchema).optional(),
  tags: z.array(TagSchema).optional(),
  auth: AuthRecipeSchema.optional(),
  clear: ClearSchema.optional(),
  reload: ProjectSchema.shape.reload.optional(),
  users: z.array(SeedUserSchema).default([]),
});

export const SeedSchema = z.object({
  schemaVersion: z.number().optional(),
  projects: z.array(SeedProjectSchema).min(1),
});

export type AppState = z.infer<typeof StateSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type User = z.infer<typeof UserSchema>;
export type Credentials = z.infer<typeof CredentialsSchema>;
export type CachedSession = z.infer<typeof CachedSessionSchema>;
export type CookieSeed = z.infer<typeof CookieSchema>;
export type OriginStorage = z.infer<typeof OriginStorageSchema>;
export type ClearCookiesMode = z.infer<typeof ClearCookiesSchema>;
export type ClearStorageMode = z.infer<typeof ClearStorageSchema>;
export type Tag = z.infer<typeof TagSchema>;
export type Seed = z.infer<typeof SeedSchema>;
export type SeedInput = z.input<typeof SeedSchema>;
export type SeedUser = z.infer<typeof SeedUserSchema>;
export type SeedUserInput = z.input<typeof SeedUserSchema>;

export function parseState(raw: unknown): AppState {
  return StateSchema.parse(raw ?? {});
}

export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length ? issue.path.join('.') + ': ' : '';
    return path + issue.message;
  });
}

export function errorLines(error: unknown): string[] {
  if (error instanceof z.ZodError) return formatIssues(error);
  return [error instanceof Error ? error.message : String(error)];
}
