import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sessionFromAuthPayload } from "./session-persist.ts";

describe("sessionFromAuthPayload", () => {
  it("reads token from a Better Auth sign-in payload", () => {
    const snap = sessionFromAuthPayload({
      token: "sess_1",
      user: { id: "u1", email: "rob@gbblox.co.uk" },
      session: { token: "sess_1", expiresAt: "2099-01-01T00:00:00.000Z" },
    });
    assert.ok(snap);
    assert.equal(snap?.token, "sess_1");
    assert.equal(snap?.email, "rob@gbblox.co.uk");
    assert.equal(snap?.userId, "u1");
    assert.ok((snap?.expiresAt ?? 0) > Date.now());
  });

  it("reads nested data.session.token", () => {
    const snap = sessionFromAuthPayload({
      data: {
        user: { id: "u2", email: "staff@gbblox.local" },
        session: { token: "sess_2", expiresAt: 4_000_000_000_000 },
      },
    });
    assert.equal(snap?.token, "sess_2");
    assert.equal(snap?.userId, "u2");
  });

  it("returns null without a token", () => {
    assert.equal(sessionFromAuthPayload({ user: { id: "u" } }), null);
  });
});
