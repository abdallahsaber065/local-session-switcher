const VARIABLE_RE = /\{\{\s*([\w.-]+)\s*\}\}/g;

/** Substitutes {{name}} placeholders; an unknown variable fails loudly (typo guard). */
export function interpolate(text: string, vars: Record<string, string>): string {
  return text.replace(VARIABLE_RE, (_match, name: string) => {
    const value = vars[name];
    if (value === undefined) throw new Error(`Unknown template variable {{${name}}}`);
    return value;
  });
}

export function interpolateDeep<T>(value: T, vars: Record<string, string>): T {
  if (typeof value === 'string') return interpolate(value, vars) as T;
  if (Array.isArray(value)) return value.map((entry) => interpolateDeep(entry, vars)) as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) out[key] = interpolateDeep(entry, vars);
    return out as T;
  }
  return value;
}
