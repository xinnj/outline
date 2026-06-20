import { test, expect } from "@playwright/test";
import { loginViaOIDC, createAnonymousContext } from "../helpers/auth";

/**
 * The base path for this test run, determined by the Playwright project name.
 */
function resolveBasePath(): string {
  const projectName = test.info().project.name;
  if (projectName === "chromium-subpath") {
    return process.env.E2E_SUBPATH || "/outline";
  }
  return "";
}

test.describe("Authentication", () => {
  let basePath: string;

  test.beforeAll(() => {
    basePath = resolveBasePath();
  });

  test("should login via OIDC and have valid session", async ({ browser }) => {
    const auth = await loginViaOIDC(browser, basePath);
    const { context, page } = auth;

    // Verify we landed on a protected page (home, collection, or doc)
    const url = page.url();
    expect(url).toMatch(/\/(home|collection|doc)/);

    // Verify auth cookies are present
    const cookies = await context.cookies();
    const accessToken = cookies.find((c) => c.name === "accessToken");
    expect(accessToken).toBeDefined();
    expect(accessToken?.value).toBeTruthy();

    const csrfToken = cookies.find((c) => c.name === "csrfToken");
    expect(csrfToken).toBeDefined();
    expect(csrfToken?.value).toBeTruthy();

    await context.close();
  });

  test("should invalidate session via /auth.delete", async ({ browser }) => {
    const auth = await loginViaOIDC(browser, basePath);
    const { context, page } = auth;

    // Capture auth cookies before logout
    const cookies = await context.cookies();
    const csrfToken =
      cookies.find((c) => c.name === "csrfToken")?.value ?? "";
    const accessToken =
      cookies.find((c) => c.name === "accessToken")?.value ?? "";
    const cookieHeader = `csrfToken=${csrfToken}; accessToken=${accessToken}`;

    // Call /auth.delete directly (bypasses OIDC redirect)
    await page.request.post(`${basePath}/api/auth.delete`, {
      headers: {
        cookie: cookieHeader,
        "x-csrf-token": csrfToken,
      },
    });

    // The same cookies should now be rejected by a protected endpoint
    const response = await page.request.post(
      `${basePath}/api/auth.info`,
      {
        headers: {
          cookie: cookieHeader,
          "x-csrf-token": csrfToken,
          "content-type": "application/json",
        },
      }
    );

    expect(response.status()).toBe(401);

    await context.close();
  });

  test("should reject protected API call with no cookies", async ({
    browser,
  }) => {
    const { context, page } = await createAnonymousContext(browser);

    const response = await page.request.post(
      `${basePath}/api/auth.info`,
      {
        headers: { "content-type": "application/json" },
      }
    );

    // Anonymous requests to protected endpoints should be rejected
    expect(response.status()).toBe(401);

    await context.close();
  });

  test("should see login page as anonymous user", async ({ browser }) => {
    const { context, page } = await createAnonymousContext(browser);

    const resp = await page.goto(`${basePath}/`);
    await page.waitForLoadState("networkidle");

    // Should get a 200 response (login page, not a 404 or error)
    expect(resp?.status()).toBe(200);

    // Should not be redirected to home (anonymous users can't access)
    const url = page.url();
    expect(url).not.toContain(`${basePath}/home`);

    await context.close();
  });
});
