import { test, expect } from "@playwright/test";
import { createAnonymousContext } from "../helpers/auth";

/**
 * Returns the base path for sub-path tests. Only valid when running
 * under the "chromium-subpath" Playwright project.
 */
function resolveBasePath(): string {
  return process.env.E2E_SUBPATH || "/outline";
}

/**
 * Constructs a full URL for the given path under the sub-path deployment.
 * Uses page.goto for navigation but constructs absolute URLs for fetch.
 */
function buildUrl(pageOrBase: { url: () => string }, path: string): string {
  const origin = new URL(pageOrBase.url()).origin;
  const basePath = resolveBasePath();
  return `${origin}${basePath}${path}`;
}

/**
 * Skips the test if not running in the sub-path project.
 */
function subpathOnly() {
  test.skip(
    test.info().project.name !== "chromium-subpath",
    "Only applies to sub-path deployment"
  );
}

test.describe("Sub-path routing and assets", () => {
  test.beforeEach(subpathOnly);

  test("should serve app shell at sub-path", async ({ browser }) => {
    const { context, page } = await createAnonymousContext(browser);
    const basePath = resolveBasePath();

    // Navigate to the sub-path root
    const resp = await page.goto(`${basePath}/`);
    await page.waitForLoadState("networkidle");
    // Should not 404 — either login page or auto-redirect to IDP
    expect(resp?.status()).toBe(200);

    await context.close();
  });

  test("should set cookies with path scoped to sub-path", async ({
    browser,
  }) => {
    const { context, page } = await createAnonymousContext(browser);
    const basePath = resolveBasePath();

    // Navigate to trigger cookie setting
    await page.goto(`${basePath}/`);
    await page.waitForLoadState("networkidle");

    const cookies = await context.cookies();

    // CSRF cookie should be scoped to the sub-path
    const csrfCookie = cookies.find((c) => c.name === "csrfToken");
    if (csrfCookie) {
      expect(csrfCookie.path).toBe(basePath);
    }

    await context.close();
  });

  test("should scope API routes under sub-path", async () => {
    const basePath = resolveBasePath();

    // Fetch directly — construct the full URL
    const origin = new URL(
      test.info().project.use.baseURL ?? ""
    ).origin;

    // API under sub-path should NOT be 404
    const apiResp = await fetch(`${origin}${basePath}/api/auth.info`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    // 401 is expected (not authenticated), 404 means routing failed
    expect(apiResp.status).not.toBe(404);

    // Same API at root should NOT be served by Outline's API (404 from
    // nginx, or an unrelated service). Outline always returns
    // application/json so verifying the content-type is sufficient.
    const rootResp = await fetch(`${origin}/api/auth.info`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(rootResp.headers.get("content-type")).not.toContain(
      "application/json"
    );
  });

  test("should serve static assets under sub-path", async () => {
    const basePath = resolveBasePath();
    const origin = new URL(
      test.info().project.use.baseURL ?? ""
    ).origin;

    // Manifest file should be served from the sub-path
    const resp = await fetch(
      `${origin}${basePath}/static/manifest.webmanifest`
    );
    expect(resp.status).toBe(200);

    // Same file at root should NOT be served by Outline (404 from nginx,
    // or an unrelated service). A successful Outline response would be 200.
    const rootResp = await fetch(`${origin}/static/manifest.webmanifest`);
    expect(rootResp.status).not.toBe(200);
  });

  test("should publish OIDC discovery at sub-path", async () => {
    const basePath = resolveBasePath();
    const origin = new URL(
      test.info().project.use.baseURL ?? ""
    ).origin;

    const resp = await fetch(
      `${origin}${basePath}/.well-known/oauth-authorization-server`
    );
    expect(resp.status).toBe(200);

    const body = await resp.json();
    // All endpoints should be scoped under the sub-path
    expect(body.issuer).toContain(basePath);
    expect(body.authorization_endpoint).toContain(basePath);
    expect(body.token_endpoint).toContain(basePath);
  });

  test("should use origin (not full URL with path) in CSP script-src", async ({
    browser,
  }) => {
    const { context, page } = await createAnonymousContext(browser);
    const basePath = resolveBasePath();

    const resp = await page.goto(`${basePath}/`);
    await page.waitForLoadState("networkidle");
    const csp = resp?.headers()?.["content-security-policy"];

    if (csp) {
      // The CSP should NOT include the full URL with path as a source
      expect(csp).not.toContain(basePath);
      expect(csp).toContain("script-src");
      // 'self' should be present
      expect(csp).toContain("'self'");
    }

    await context.close();
  });

  test("should serve opensearch.xml under sub-path", async () => {
    const basePath = resolveBasePath();
    const origin = new URL(
      test.info().project.use.baseURL ?? ""
    ).origin;

    const resp = await fetch(`${origin}${basePath}/opensearch.xml`);
    // 200 = success, 429 = rate-limited (test env may have rate limiting enabled)
    expect([200, 429]).toContain(resp.status);
  });

  test("should include sub-path in service worker registration script", async ({
    browser,
  }) => {
    const { context, page } = await createAnonymousContext(browser);
    const basePath = resolveBasePath();

    await page.goto(`${basePath}/`);
    await page.waitForLoadState("networkidle");

    // Check inline scripts for service worker registration with correct scope
    const swScript = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll("script"));
      return scripts
        .map((s) => s.textContent ?? "")
        .filter((t) => t.includes("sw.js") && t.includes("serviceWorker"))
        .join("\n");
    });

    if (swScript) {
      expect(swScript).toContain(`${basePath}/static/sw.js`);
      expect(swScript).toContain(`scope: "${basePath}/"`);
    }

    await context.close();
  });

  test("should set oauth_csrf cookie with path scoped to sub-path", async ({
    browser,
  }) => {
    const { context } = await createAnonymousContext(browser);
    const basePath = resolveBasePath();
    const origin = new URL(
      test.info().project.use.baseURL ?? ""
    ).origin;

    // Use Node.js fetch with `redirect: "manual"` so we can read the
    // Set-Cookie header from the 302 response before the redirect to the
    // OIDC provider is followed. Browser fetch returns an opaque redirect
    // response with unreadable headers.
    const resp = await fetch(`${origin}${basePath}/auth/oidc`, {
      redirect: "manual",
    });
    expect(resp.status).toBe(302);

    const rawCookie = resp.headers.get("set-cookie") ?? "";
    expect(rawCookie).toContain("oauth_csrf=");
    expect(rawCookie).toContain(`path=${basePath}`);

    await context.close();
  });

  test("should serve desktop redirect page under sub-path", async ({
    browser,
  }) => {
    const { context, page } = await createAnonymousContext(browser);
    const basePath = resolveBasePath();

    // DesktopRedirect constructs `outline://` + host + env.BASE_PATH +
    // /auth/redirect?... which previously missed the base-path prefix.
    // Verify the page is served and renders under the sub-path — the fix
    // is covered by the Vitest server tests and the same BASE_PATH pattern
    // used by the rest of the sub-path-aware code.
    const resp = await page.goto(
      `${basePath}/desktop-redirect?token=test-transfer-token`
    );
    expect(resp?.status()).toBe(200);

    // The component shows a "Signing in…" heading unconditionally.
    const heading = await page.textContent("h1");
    expect(heading).toContain("Signing in");

    await context.close();
  });
});
