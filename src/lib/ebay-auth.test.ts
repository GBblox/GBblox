import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isEbayAuthError } from "./ebay-auth.ts";

describe("isEbayAuthError", () => {
  it("detects expired IAF tokens", () => {
    assert.equal(isEbayAuthError("<LongMessage>IAF token has expired</LongMessage>"), true);
    assert.equal(isEbayAuthError("<ErrorCode>931</ErrorCode><ShortMessage>Auth token is invalid</ShortMessage>"), true);
    assert.equal(isEbayAuthError("<Ack>Success</Ack>"), false);
  });
});
