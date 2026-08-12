import Redis from "@server/storage/redis";
import { RedisPrefixHelper } from "@server/utils/RedisPrefixHelper";
import { UserRole } from "@shared/types";
import { getTestServer } from "@server/test/support";
import { getAdminRoleFromGroups, getGroupsFromClaims } from "./oidcRouter";
import env from "../env";

const server = getTestServer();

describe("getGroupsFromClaims", () => {
  const originalClaim = env.OIDC_GROUP_CLAIM;

  afterEach(() => {
    env.OIDC_GROUP_CLAIM = originalClaim;
  });

  function setClaim(claim: string | undefined) {
    env.OIDC_GROUP_CLAIM = claim;
  }

  it("returns undefined when OIDC_GROUP_CLAIM is not set", () => {
    setClaim(undefined);
    expect(getGroupsFromClaims({ groups: ["admin"] }, {}, env)).toBeUndefined();
  });

  it("returns the string array from an array claim in the profile", () => {
    setClaim("groups");
    expect(
      getGroupsFromClaims({ groups: ["engineering", "design"] }, {}, env)
    ).toEqual(["engineering", "design"]);
  });

  it("filters non-string members out of an array claim", () => {
    setClaim("groups");
    expect(
      getGroupsFromClaims({ groups: ["admin", 123, { x: 1 }, null] }, {}, env)
    ).toEqual(["admin"]);
  });

  it("returns a single-element array for a string claim", () => {
    setClaim("role");
    expect(getGroupsFromClaims({ role: "admin" }, {}, env)).toEqual(["admin"]);
  });

  it("supports nested claim paths via dot notation", () => {
    setClaim("realm_access.roles");
    expect(
      getGroupsFromClaims(
        { realm_access: { roles: ["admin", "user"] } },
        {},
        env
      )
    ).toEqual(["admin", "user"]);
  });

  it("falls back to token when claim is missing in profile", () => {
    setClaim("groups");
    expect(getGroupsFromClaims({}, { groups: ["engineering"] }, env)).toEqual([
      "engineering",
    ]);
  });

  it("returns undefined when claim is missing in both profile and token", () => {
    setClaim("groups");
    expect(getGroupsFromClaims({}, {}, env)).toBeUndefined();
  });

  it("returns undefined when claim value is neither array nor string", () => {
    setClaim("groups");
    expect(getGroupsFromClaims({ groups: 123 }, {}, env)).toBeUndefined();
  });

  it("returns an empty array when the claim array contains no strings", () => {
    setClaim("groups");
    expect(getGroupsFromClaims({ groups: [123, null, {}] }, {}, env)).toEqual(
      []
    );
  });
});

describe("getAdminRoleFromGroups", () => {
  const originalAdminGroup = env.OIDC_ADMIN_GROUP;

  afterEach(() => {
    env.OIDC_ADMIN_GROUP = originalAdminGroup;
  });

  function setAdminGroup(name: string | undefined) {
    env.OIDC_ADMIN_GROUP = name;
  }

  it("returns undefined when OIDC_ADMIN_GROUP is not set", () => {
    setAdminGroup(undefined);
    expect(getAdminRoleFromGroups(["outline_admin"], env)).toBeUndefined();
  });

  it("returns Admin when groups include the admin group", () => {
    setAdminGroup("outline_admin");
    expect(getAdminRoleFromGroups(["engineering", "outline_admin"], env)).toBe(
      UserRole.Admin
    );
  });

  it("returns undefined when groups do not include the admin group", () => {
    setAdminGroup("outline_admin");
    expect(getAdminRoleFromGroups(["engineering"], env)).toBeUndefined();
  });

  it("returns undefined when groups is undefined", () => {
    setAdminGroup("outline_admin");
    expect(getAdminRoleFromGroups(undefined, env)).toBeUndefined();
  });

  it("returns undefined when groups is empty", () => {
    setAdminGroup("outline_admin");
    expect(getAdminRoleFromGroups([], env)).toBeUndefined();
  });

  it("matches the admin group name case-sensitively", () => {
    setAdminGroup("outline_admin");
    expect(getAdminRoleFromGroups(["Outline_Admin"], env)).toBeUndefined();
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
