/** The only Google account allowed to use GBblox. */
export const OWNER_EMAIL = "rob@gbblox.co.uk";

export function isOwnerEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === OWNER_EMAIL;
}
