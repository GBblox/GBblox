import { createMiddleware } from "@tanstack/react-start";
import { isOwnerEmail } from "@/lib/owner";

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor() {
    super("Forbidden");
    this.name = "ForbiddenError";
  }
}

/**
 * After authMiddleware has a verified session, require the Google account
 * rob@gbblox.co.uk. Inventory stays store-wide — this only decides who may call it.
 */
export const ownerMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const { getBearerToken } = await import("@/lib/auth/client");
    return next({ sendContext: { bearerToken: getBearerToken() ?? undefined } });
  })
  .server(async ({ next, context }) => {
    const { getSessionUser, UnauthorizedError } = await import("@/lib/auth/verify.server");
    const user = await getSessionUser(
      "bearerToken" in context ? (context.bearerToken as string | undefined) : undefined,
    );
    if (!user) throw new UnauthorizedError();
    if (!isOwnerEmail(user.email)) throw new ForbiddenError();
    return next({
      context: {
        userId: user.id,
        email: user.email ?? "",
      },
    });
  });

