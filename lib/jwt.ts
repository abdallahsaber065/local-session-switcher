import type { User } from './schema';

/** Returns the `exp` claim of a JWT string in ms, or null when the value is not a decodable JWT. */
export function jwtExpMs(value: string): number | null {
  if (!/^eyJ[\w-]*\.[\w-]+\./.test(value)) return null;
  try {
    const payload = value.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/') ?? '';
    const decoded = JSON.parse(atob(payload)) as { exp?: unknown };
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Earliest JWT expiry across all cookie/storage values of a user profile. */
export function earliestExpiry(user: User): number | null {
  const values: string[] = [
    ...user.cookies.map((cookie) => cookie.value),
    ...Object.values(user.storage).flatMap((storage) => [
      ...Object.values(storage.localStorage),
      ...Object.values(storage.sessionStorage),
    ]),
  ];
  const expiries = values.map(jwtExpMs).filter((exp): exp is number => exp !== null);
  return expiries.length > 0 ? Math.min(...expiries) : null;
}

export function fmtExpiry(exp: number): { label: string; expired: boolean } {
  const delta = exp - Date.now();
  const expired = delta <= 0;
  const minutes = Math.floor(Math.abs(delta) / 60_000);
  const label = expired
    ? `JWT expired ${minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`} ago`
    : `JWT expires in ${minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`}`;
  return { label, expired };
}
