import { browser } from 'wxt/browser';
import type { AuthDeps } from './runner';

/** Chrome-backed dependencies for the auth runner (service-worker fetch + cookie jar reads). */
export function browserAuthDeps(): AuthDeps {
  return {
    fetch: (input, init) => fetch(input as RequestInfo, init),
    readCookie: async (origin, name) => {
      try {
        const cookies = await browser.cookies.getAll({ name, domain: new URL(origin).hostname });
        return cookies[0]?.value ?? null;
      } catch {
        return null;
      }
    },
    now: () => Date.now(),
  };
}
