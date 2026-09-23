import { z } from 'zod';

export const SameSiteSchema = z.enum(['no_restriction', 'lax', 'strict', 'unspecified']);

export const ExtractRuleSchema = z.union([
  z.object({ jsonPath: z.string().min(1) }),
  z.object({ regex: z.string().min(1), group: z.number().int().min(0).default(1) }),
  z.object({ header: z.string().min(1) }),
  z.object({ cookie: z.string().min(1), decode: z.enum(['none', 'url', 'base64']).default('none') }),
]);

export const HttpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export const AuthRequestSchema = z.object({
  method: HttpMethodSchema.default('POST'),
  url: z.string().min(1),
  headers: z.record(z.string(), z.string()).default({}),
  bodyType: z.enum(['json', 'form', 'raw']).default('json'),
  body: z.unknown().optional(),
  credentials: z.enum(['include', 'omit']).default('include'),
  /** Status codes that count as success; defaults to any 2xx. */
  expectStatus: z.array(z.number().int()).optional(),
});

export const AuthStepSchema = AuthRequestSchema.extend({
  extract: z.record(z.string(), ExtractRuleSchema).default({}),
});

export const SinkSchema = z.union([
  z.object({
    kind: z.literal('localStorage'),
    key: z.string().min(1),
    value: z.string(),
    origin: z.string().optional(),
  }),
  z.object({
    kind: z.literal('sessionStorage'),
    key: z.string().min(1),
    value: z.string(),
    origin: z.string().optional(),
  }),
  z.object({
    kind: z.literal('cookie'),
    name: z.string().min(1),
    value: z.string(),
    origin: z.string().optional(),
    path: z.string().default('/'),
    httpOnly: z.boolean().default(false),
    secure: z.boolean().default(false),
    sameSite: SameSiteSchema.default('lax'),
    expirationDate: z.number().optional(),
  }),
]);

export const AuthRecipeSchema = z.object({
  /** Ordered steps run before the login request (CSRF handshakes etc.). */
  preflight: z.array(AuthStepSchema).default([]),
  login: AuthStepSchema,
  /** Where the obtained session must live in the browser. Cookies set by the server are stored automatically. */
  outputs: z.array(SinkSchema).default([]),
  refresh: AuthStepSchema.extend({ outputs: z.array(SinkSchema).optional() }).optional(),
  session: z
    .object({
      /** Fallback lifetime when the access token is not a decodable JWT. */
      ttlMinutes: z.number().positive().optional(),
      /** Optional check that a cached session still works; failing it forces refresh/login. */
      verify: z
        .object({
          method: HttpMethodSchema.default('GET'),
          url: z.string().min(1),
          expectStatus: z.number().int().default(200),
        })
        .optional(),
    })
    .default({}),
});

export type AuthRecipe = z.infer<typeof AuthRecipeSchema>;
export type AuthStep = z.infer<typeof AuthStepSchema>;
export type AuthRequest = z.infer<typeof AuthRequestSchema>;
export type ExtractRule = z.infer<typeof ExtractRuleSchema>;
export type Sink = z.infer<typeof SinkSchema>;
export type SameSite = z.infer<typeof SameSiteSchema>;
