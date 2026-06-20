import env from "@server/env";
import { getTestServer } from "@server/test/support";

const server = getTestServer();

/**
 * Joins all Set-Cookie headers from the response so we can assert on the
 * full cookie jar. node-fetch's `headers.get("set-cookie")` only returns
 * the first value, but tests often have multiple cookies (e.g. CSRF token
 * and OAuth CSRF nonce).
 */
function allSetCookies(res: Awaited<ReturnType<typeof server.get>>): string {
  return (res.headers.raw()["set-cookie"] ?? []).join("; ");
}

describe("StateStore OAUTH_CSRF cookie", () => {
  const originalURL = env.URL;

  afterEach(() => {
    env.URL = originalURL;
  });

  it("sets the oauth_csrf cookie path to the base path", async () => {
    env.URL = "https://app.outline.dev/outline";
    const res = await server.get("/auth/oidc", { redirect: "manual" });
    expect(res.status).toBe(302);

    const cookies = allSetCookies(res);
    expect(cookies).toContain("oauth_csrf=");
    expect(cookies).toContain("path=/outline");
  });
});
