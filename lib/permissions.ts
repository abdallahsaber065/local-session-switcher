import { browser } from 'wxt/browser';
import { assertLocalOrigins, extraPermissionPatterns } from './hosts';

/**
 * Request optional host access for any extra local origins on this project.
 * Must run from a user gesture (Save, Apply import, click-to-switch).
 * Never requests a site-wide http(s) wildcard — only the specific origin patterns.
 */
export async function ensureOriginAccess(origins: string[]): Promise<{ requested: string[] }> {
  assertLocalOrigins(origins);
  const extra = extraPermissionPatterns(origins);
  if (extra.length === 0) return { requested: [] };

  const already = await browser.permissions.contains({ origins: extra });
  if (already) return { requested: [] };

  const granted = await browser.permissions.request({ origins: extra });
  if (!granted) {
    throw new Error(
      `Chrome did not grant access to ${extra.join(', ')}. Allow the extra local origin(s) when prompted, or remove them from the project.`,
    );
  }
  return { requested: extra };
}

export async function hasOriginAccess(origins: string[]): Promise<boolean> {
  assertLocalOrigins(origins);
  const extra = extraPermissionPatterns(origins);
  if (extra.length === 0) return true;
  return browser.permissions.contains({ origins: extra });
}

export async function assertHostAccess(origins: string[]): Promise<void> {
  assertLocalOrigins(origins);
  const extra = extraPermissionPatterns(origins);
  if (extra.length === 0) return;
  const ok = await browser.permissions.contains({ origins: extra });
  if (!ok) {
    throw new Error(
      `Missing host access for ${extra.join(', ')}. Open Settings, save the project, and allow the origin when Chrome prompts.`,
    );
  }
}
