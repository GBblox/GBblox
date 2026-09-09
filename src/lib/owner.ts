/** The only Google account allowed to use GBblox when login is on. */
export const OWNER_EMAIL = "rob@gbblox.co.uk";

/** Flip to false to require Google sign-in as OWNER_EMAIL again. */
export const GOOGLE_LOGIN_PAUSED = true;

export function isOwnerEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === OWNER_EMAIL;
}
