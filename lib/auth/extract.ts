import type { ExtractRule } from './schema';

/** Reads `a.b.0.c` style paths (leading `$.` optional) out of parsed JSON. */
export function jsonPathGet(root: unknown, path: string): unknown {
  const parts = path
    .replace(/^\$\.?/, '')
    .split('.')
    .filter(Boolean);
  let current: unknown = root;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(part);
      current = Number.isInteger(index) ? current[index] : undefined;
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

export type ExtractionSource = {
  bodyText: string;
  json: unknown;
  header: (name: string) => string | null;
  cookie: (name: string) => Promise<string | null>;
};

export function decodeExtracted(value: string, decode: 'none' | 'url' | 'base64'): string {
  try {
    if (decode === 'url') return decodeURIComponent(value);
    if (decode === 'base64') return Buffer.from(value, 'base64').toString('utf8');
  } catch {
    return value;
  }
  return value;
}

/** Returns null when the rule finds nothing (the runner turns that into a clear error). */
export async function extractValue(rule: ExtractRule, source: ExtractionSource): Promise<string | null> {
  if ('jsonPath' in rule) {
    const value = jsonPathGet(source.json, rule.jsonPath);
    return value === undefined || value === null ? null : String(value);
  }
  if ('regex' in rule) {
    const match = new RegExp(rule.regex).exec(source.bodyText);
    return match ? (match[rule.group] ?? null) : null;
  }
  if ('header' in rule) {
    return source.header(rule.header);
  }
  const cookie = await source.cookie(rule.cookie);
  return cookie === null ? null : decodeExtracted(cookie, rule.decode);
}
