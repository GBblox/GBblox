import assert from "node:assert/strict";
import { test } from "node:test";
import { isOwnerEmail, OWNER_EMAIL } from "./owner.ts";

test("only rob@gbblox.co.uk is authorised", () => {
  assert.equal(OWNER_EMAIL, "rob@gbblox.co.uk");
  assert.equal(isOwnerEmail("rob@gbblox.co.uk"), true);
  assert.equal(isOwnerEmail("Rob@GBblox.co.uk"), true);
  assert.equal(isOwnerEmail(" rob@gbblox.co.uk "), true);
  assert.equal(isOwnerEmail("other@gbblox.co.uk"), false);
  assert.equal(isOwnerEmail("rob@gmail.com"), false);
  assert.equal(isOwnerEmail(""), false);
  assert.equal(isOwnerEmail(null), false);
  assert.equal(isOwnerEmail(undefined), false);
});
