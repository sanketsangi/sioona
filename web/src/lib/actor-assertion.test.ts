import { describe, expect, it } from "vitest";

import {
  ACTOR_USER_ID_VECTOR,
  ACTOR_USER_ID_VECTOR_EMAIL,
  actorUserId,
  readActorClaims,
  signActorAssertion,
} from "./actor-assertion";

describe("actor assertion", () => {
  it("derives the shared user id vector", () => {
    expect(actorUserId(ACTOR_USER_ID_VECTOR_EMAIL)).toBe(ACTOR_USER_ID_VECTOR);
    expect(actorUserId("  Reviewer@Example.Test ")).toBe(ACTOR_USER_ID_VECTOR);
  });

  it("signs a 60-second sioona-web assertion", () => {
    const token = signActorAssertion("user-1", "tenant_partner", "test-key", 60, 1_700_000_000);
    const claims = readActorClaims(token);
    expect(claims).toMatchObject({
      iss: "sioona-web",
      aud: "sioona-api",
      sub: "user-1",
      tid: "tenant_partner",
      iat: 1_700_000_000,
      exp: 1_700_000_060,
    });
    expect(claims.jti).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(token.split(".")).toHaveLength(3);
  });
});
