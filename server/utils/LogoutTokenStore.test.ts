import type { Context } from "koa";
import env from "@server/env";
import Redis from "@server/storage/redis";
import { LogoutTokenStore } from "./LogoutTokenStore";
import { RedisPrefixHelper } from "./RedisPrefixHelper";

interface SetCookieOptions {
  path?: string;
}

/**
 * Minimal Koa context stub exposing only the cookie jar and hostname the store
 * relies on. Captures the options passed to `cookies.set` so tests can assert
 * on the cookie `path` scope.
 */
function buildContext(cookies: Record<string, string> = {}) {
  const jar = new Map(Object.entries(cookies));
  const setOptions = new Map<string, SetCookieOptions>();
  return {
    request: { hostname: "localhost" },
    cookies: {
      get: (name: string) => jar.get(name),
      set: (name: string, value: string, options?: SetCookieOptions) => {
        setOptions.set(name, options ?? {});
        if (value) {
          jar.set(name, value);
        } else {
          jar.delete(name);
        }
      },
    },
    setOptions,
  } as unknown as Context & { setOptions: Map<string, SetCookieOptions> };
}

describe("LogoutTokenStore", () => {
  const store = new LogoutTokenStore("oidc");

  it("persists a token behind a session cookie and consumes it once", async () => {
    const signInCtx = buildContext();
    await store.persist(signInCtx, "the-token");

    const sessionId = signInCtx.cookies.get("oidcSession");
    expect(sessionId).toBeTruthy();
    expect(
      await Redis.defaultClient.get(
        RedisPrefixHelper.getLogoutTokenKey("oidc", sessionId!)
      )
    ).toEqual("the-token");

    const logoutCtx = buildContext({ oidcSession: sessionId! });
    expect(await store.consume(logoutCtx)).toEqual("the-token");

    // Consuming clears both the cookie and the server-side token.
    expect(logoutCtx.cookies.get("oidcSession")).toBeUndefined();
    expect(
      await Redis.defaultClient.get(
        RedisPrefixHelper.getLogoutTokenKey("oidc", sessionId!)
      )
    ).toBeNull();
  });

  it("returns null when there is no session cookie", async () => {
    expect(await store.consume(buildContext())).toBeNull();
  });

  it("namespaces the cookie and key by provider", async () => {
    const samlStore = new LogoutTokenStore("saml");
    const ctx = buildContext();
    await samlStore.persist(ctx, "saml-token");

    const sessionId = ctx.cookies.get("samlSession");
    expect(sessionId).toBeTruthy();
    expect(ctx.cookies.get("oidcSession")).toBeUndefined();
    expect(
      await Redis.defaultClient.get(
        RedisPrefixHelper.getLogoutTokenKey("saml", sessionId!)
      )
    ).toEqual("saml-token");
  });

  describe("basePath", () => {
    it("scopes the logout cookie path under the base path", async () => {
      env.URL = "https://example.com/outline";

      const ctx = buildContext();
      await store.persist(ctx, "the-token");

      expect(ctx.setOptions.get("oidcSession")?.path).toEqual(
        "/outline/auth/oidc.logout"
      );
    });

    it("scopes the logout cookie path at the domain root", async () => {
      env.URL = "https://example.com";

      const ctx = buildContext();
      await store.persist(ctx, "the-token");

      expect(ctx.setOptions.get("oidcSession")?.path).toEqual(
        "/auth/oidc.logout"
      );
    });
  });
});
