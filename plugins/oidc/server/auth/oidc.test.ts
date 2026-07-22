import Redis from "@server/storage/redis";
import { RedisPrefixHelper } from "@server/utils/RedisPrefixHelper";
import { UserRole } from "@shared/types";
import { getTestServer } from "@server/test/support";
import { getAdminRoleFromClaims } from "./oidcRouter";
import env from "../env";

const server = getTestServer();

describe("getAdminRoleFromClaims", () => {
  const originalClaim = env.OIDC_ADMIN_CLAIM;
  const originalClaimValue = env.OIDC_ADMIN_CLAIM_VALUE;

  afterEach(() => {
    env.OIDC_ADMIN_CLAIM = originalClaim;
    env.OIDC_ADMIN_CLAIM_VALUE = originalClaimValue;
  });

  function setEnv(claim: string | undefined, value: string | undefined) {
    env.OIDC_ADMIN_CLAIM = claim;
    env.OIDC_ADMIN_CLAIM_VALUE = value;
  }

  it("returns undefined when OIDC_ADMIN_CLAIM is not set", () => {
    setEnv(undefined, "admin");
    const result = getAdminRoleFromClaims(
      { groups: ["admin"] },
      {},
      env
    );
    expect(result).toBeUndefined();
  });

  it("returns undefined when OIDC_ADMIN_CLAIM_VALUE is not set", () => {
    setEnv("groups", undefined);
    const result = getAdminRoleFromClaims(
      { groups: ["admin"] },
      {},
      env
    );
    expect(result).toBeUndefined();
  });

  it("returns Admin when array claim contains the value", () => {
    setEnv("groups", "outline-admins");
    const result = getAdminRoleFromClaims(
      { groups: ["engineering", "outline-admins"] },
      {},
      env
    );
    expect(result).toBe(UserRole.Admin);
  });

  it("returns undefined when array claim does not contain the value", () => {
    setEnv("groups", "outline-admins");
    const result = getAdminRoleFromClaims(
      { groups: ["engineering"] },
      {},
      env
    );
    expect(result).toBeUndefined();
  });

  it("returns Admin when string claim matches exactly", () => {
    setEnv("role", "admin");
    const result = getAdminRoleFromClaims(
      { role: "admin" },
      {},
      env
    );
    expect(result).toBe(UserRole.Admin);
  });

  it("returns undefined when string claim does not match", () => {
    setEnv("role", "admin");
    const result = getAdminRoleFromClaims(
      { role: "user" },
      {},
      env
    );
    expect(result).toBeUndefined();
  });

  it("supports nested claim paths via dot notation", () => {
    setEnv("realm_access.roles", "admin");
    const result = getAdminRoleFromClaims(
      { realm_access: { roles: ["admin", "user"] } },
      {},
      env
    );
    expect(result).toBe(UserRole.Admin);
  });

  it("falls back to token when claim is missing in profile", () => {
    setEnv("groups", "outline-admins");
    const result = getAdminRoleFromClaims(
      {},
      { groups: ["outline-admins"] },
      env
    );
    expect(result).toBe(UserRole.Admin);
  });

  it("returns undefined when claim is missing in both profile and token", () => {
    setEnv("groups", "outline-admins");
    const result = getAdminRoleFromClaims({}, {}, env);
    expect(result).toBeUndefined();
  });

  it("returns undefined when claim value is neither array nor string", () => {
    setEnv("groups", "admin");
    const result = getAdminRoleFromClaims(
      { groups: 123 },
      {},
      env
    );
    expect(result).toBeUndefined();
  });
});

describe("oidc", () => {
  it("should pass query params along with auth redirect", async () => {
    const res = await server.get("/auth/oidc?myParam=someParam", {
      redirect: "manual",
    });
    expect(res.headers.get("location")).not.toBeNull();
    const redirectLocation = new URL(res.headers.get("location")!);
    expect(res.status).toEqual(302);
    expect(redirectLocation.searchParams.get("myParam")).toEqual("someParam");
  });

  describe("logout", () => {
    it("should redirect to the provider with a spec-compliant logout request", async () => {
      const res = await server.get("/auth/oidc.logout", {
        redirect: "manual",
      });
      expect(res.status).toEqual(302);
      const redirectLocation = new URL(res.headers.get("location")!);
      expect(redirectLocation.origin + redirectLocation.pathname).toEqual(
        "http://localhost/logout"
      );
      expect(redirectLocation.searchParams.get("client_id")).toEqual(
        "client-id"
      );
      expect(
        redirectLocation.searchParams.get("post_logout_redirect_uri")
      ).toEqual("http://localhost:3000");
    });

    it("should include the id_token_hint when present", async () => {
      const sessionId = "test-session-id";
      await Redis.defaultClient.set(
        RedisPrefixHelper.getLogoutTokenKey("oidc", sessionId),
        "fake-id-token"
      );

      const res = await server.get("/auth/oidc.logout", {
        redirect: "manual",
        headers: {
          Cookie: `oidcSession=${sessionId}`,
        },
      });
      expect(res.status).toEqual(302);
      const redirectLocation = new URL(res.headers.get("location")!);
      expect(redirectLocation.searchParams.get("id_token_hint")).toEqual(
        "fake-id-token"
      );
      expect(res.headers.get("set-cookie")).toContain(
        "oidcSession=; path=/auth/oidc.logout;"
      );
      // The token is consumed from the server-side store on logout.
      expect(
        await Redis.defaultClient.get(
          RedisPrefixHelper.getLogoutTokenKey("oidc", sessionId)
        )
      ).toBeNull();
    });
  });
});
