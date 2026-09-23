import type { AuthRecipe } from './schema';

export type AuthPreset = {
  id: string;
  label: string;
  note: string;
  recipe: unknown;
};

const ORIGIN = 'http://localhost:3000';

/**
 * Starting points, not gospel: edit the URLs and field names to match the project.
 * Presets are validated by AuthRecipeSchema before they are saved.
 */
export const AUTH_PRESETS: AuthPreset[] = [
  {
    id: 'session-cookie',
    label: 'Session cookie (Express / Passport / Rails)',
    note: 'The login response sets a cookie; the browser stores it automatically. Add outputs only when the app also needs tokens in storage.',
    recipe: {
      login: {
        method: 'POST',
        url: `${ORIGIN}/api/login`,
        bodyType: 'json',
        headers: { 'Content-Type': 'application/json' },
        body: { email: '{{username}}', password: '{{password}}' },
      },
      outputs: [],
      session: { ttlMinutes: 60 },
    },
  },
  {
    id: 'nextauth',
    label: 'NextAuth credentials',
    note: 'Fetches the CSRF token first, then posts the credentials callback form; the session cookie is set by the response.',
    recipe: {
      preflight: [
        {
          method: 'GET',
          url: `${ORIGIN}/api/auth/csrf`,
          extract: { csrfToken: { jsonPath: 'csrfToken' } },
        },
      ],
      login: {
        method: 'POST',
        url: `${ORIGIN}/api/auth/callback/credentials`,
        bodyType: 'form',
        body: { csrfToken: '{{csrfToken}}', email: '{{username}}', password: '{{password}}', json: 'true' },
      },
      outputs: [],
      session: { ttlMinutes: 60 },
    },
  },
  {
    id: 'sanctum',
    label: 'Laravel Sanctum (SPA)',
    note: 'Gets the XSRF-TOKEN cookie, then sends it back as a header (URL-decoded).',
    recipe: {
      preflight: [{ method: 'GET', url: `${ORIGIN}/sanctum/csrf-cookie` }],
      login: {
        method: 'POST',
        url: `${ORIGIN}/login`,
        bodyType: 'json',
        headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': '{{xsrf}}' },
        body: { email: '{{username}}', password: '{{password}}' },
        extract: { xsrf: { cookie: 'XSRF-TOKEN', decode: 'url' } },
      },
      outputs: [],
      session: { ttlMinutes: 120 },
    },
  },
  {
    id: 'django',
    label: 'Django session (CSRF form)',
    note: 'Scrapes the CSRF token out of the login page, then posts the form; sessionid lands as a cookie.',
    recipe: {
      preflight: [
        {
          method: 'GET',
          url: 'http://localhost:8000/login/',
          extract: {
            csrfmiddlewaretoken: {
              regex: 'name="csrfmiddlewaretoken" value="([^"]+)"',
              group: 1,
            },
          },
        },
      ],
      login: {
        method: 'POST',
        url: 'http://localhost:8000/login/',
        bodyType: 'form',
        headers: { Referer: 'http://localhost:8000/login/' },
        body: {
          csrfmiddlewaretoken: '{{csrfmiddlewaretoken}}',
          username: '{{username}}',
          password: '{{password}}',
        },
      },
      outputs: [],
      session: { ttlMinutes: 720 },
    },
  },
  {
    id: 'jwt-refresh',
    label: 'JWT + refresh token (token in localStorage)',
    note: 'Reads both tokens from the JSON response, stores the access token where the app expects it, and refreshes when the JWT expires.',
    recipe: {
      login: {
        method: 'POST',
        url: `${ORIGIN}/api/auth/login`,
        bodyType: 'json',
        headers: { 'Content-Type': 'application/json' },
        body: { email: '{{username}}', password: '{{password}}' },
        extract: {
          accessToken: { jsonPath: 'token' },
          refreshToken: { jsonPath: 'refreshToken' },
        },
      },
      outputs: [{ kind: 'localStorage', key: 'auth-token', value: '{{accessToken}}' }],
      refresh: {
        method: 'POST',
        url: `${ORIGIN}/api/auth/refresh`,
        bodyType: 'json',
        headers: { 'Content-Type': 'application/json' },
        body: { refreshToken: '{{refreshToken}}' },
        extract: {
          accessToken: { jsonPath: 'token' },
          refreshToken: { jsonPath: 'refreshToken' },
        },
      },
      session: { ttlMinutes: 15 },
    },
  },
];
