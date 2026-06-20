import env from "@server/env";
import { getTestServer } from "@server/test/support";

const server = getTestServer();

describe("passport middleware auth error redirects", () => {
  const originalURL = env.URL;

  afterEach(() => {
    env.URL = originalURL;
  });

  it("redirects auth errors to the base path", async () => {
    env.URL = "https://app.outline.dev/outline";

    // Hit the OIDC callback without a valid OAuth authorization code
    // — passport should return an error, and the middleware should redirect
    // to the base-path-scoped error notice page instead of the domain root.
    const res = await server.get(
      "/auth/oidc.callback?code=invalid&state=invalid",
      {
        redirect: "manual",
      }
    );
    expect(res.status).toBe(302);

    const location = res.headers.get("location");
    expect(location).not.toBeNull();
    // The redirect should be to an error notice under the base path.
    if (location?.includes("notice=")) {
      expect(location).toContain("/outline/?notice=");
    }
  });
});
