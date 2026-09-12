import { createMiddleware } from "@tanstack/react-start";
import { GOOGLE_LOGIN_PAUSED, isOwnerEmail } from "@/lib/owner";

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
    const { getSessionUser, UnauthorizedError, DEV_USER_ID } = await import("@/lib/auth/verify.server");
    const { isWorkspacePreview } = await import("@/lib/env.server");
    const { passwordLoginRequired } = await import("@/lib/env-login");
    const user = await getSessionUser(
      "bearerToken" in context ? (context.bearerToken as string | undefined) : undefined,
    );
    if (!user) {
      if (passwordLoginRequired()) throw new UnauthorizedError();
      if (isWorkspacePreview() || GOOGLE_LOGIN_PAUSED) {
        return next({ context: { userId: DEV_USER_ID, email: "" } });
      }
      throw new UnauthorizedError();
    }
    if (!GOOGLE_LOGIN_PAUSED && !isOwnerEmail(user.email) && !isWorkspacePreview()) {
      throw new ForbiddenError();
    }
    return next({
      context: {
        userId: user.id,
        email: user.email ?? "",
      },
    });
  });

