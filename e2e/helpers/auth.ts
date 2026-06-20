import type { Browser, BrowserContext, Page } from "@playwright/test";

/**
 * Performs a full OIDC login flow against a Keycloak-backed Outline instance.
 *
 * Flow: app root → login page → click OIDC button → Keycloak login form →
 * fill credentials → submit → redirect back to Outline home.
 *
 * Requires E2E_ADMIN_USERNAME and E2E_ADMIN_PASSWORD env vars.
 */
export async function loginViaOIDC(
  browser: Browser,
  basePath: string
): Promise<{ context: BrowserContext; page: Page }> {
  // Strip surrounding quotes that may come from .env file shell-style values
  const username = process.env.E2E_ADMIN_USERNAME?.replace(/^["']|["']$/g, "");
  const password = process.env.E2E_ADMIN_PASSWORD?.replace(/^["']|["']$/g, "");
  if (!username || !password) {
    throw new Error(
      "E2E_ADMIN_USERNAME and E2E_ADMIN_PASSWORD env vars are required for OIDC login."
    );
  }

  const oidcDisplayName =
    process.env.E2E_OIDC_DISPLAY_NAME || "OpenID Connect";

  const context = await browser.newContext();
  const page = await context.newPage();

  // Step 1: Navigate to the app root and wait for the SPA to hydrate.
  await page.goto(basePath ? `${basePath}/` : "/", { waitUntil: "domcontentloaded" });
  // The Outline SPA is client-rendered — wait until the React app mounts
  // and the login UI (or a redirect) appears before interacting.
  await page.waitForTimeout(2000);

  // Step 2: Click the OIDC provider button on the login page.
  // If OIDC_DISABLE_REDIRECT is unset (default) and OIDC is the only
  // provider, the page auto-redirects to Keycloak — so the button may
  // not be visible. We only click if it's there.
  const oidcButton = page.locator(
    `button:has-text("Continue with ${oidcDisplayName}")`
  );
  if (await oidcButton.isVisible({ timeout: 8000 }).catch(() => false)) {
    await oidcButton.click();
  }

  // Step 3: We should now be on Keycloak's login page.
  // Wait for the username field to appear.
  await page.waitForSelector(
    '#username, input[name="username"], input[id="username"]',
    { timeout: 15000 }
  );

  // Step 4: Fill in credentials
  await page.fill(
    '#username, input[name="username"], input[id="username"]',
    username
  );
  await page.fill(
    '#password, input[name="password"], input[id="password"]',
    password
  );

  // Step 5: Submit the Keycloak login form
  const submitButton = page.locator(
    '#kc-login, input[type="submit"][value="Sign In"], button[type="submit"]:has-text("Sign In"), button[type="submit"]'
  );
  await submitButton.first().click();

  // Step 6: Wait for redirect back to Outline.
  // After login, Outline redirects to /home or a collection.
  await page.waitForURL(
    (url) => {
      const path = url.pathname;
      return (
        path.includes("/home") ||
        path.includes("/collection/") ||
        path.includes("/doc/")
      );
    },
    { timeout: 30000 }
  );

  // Step 7: Verify we're authenticated by checking for the accessToken cookie
  const cookies = await context.cookies();
  const accessToken = cookies.find((c) => c.name === "accessToken");
  if (!accessToken) {
    throw new Error(
      "OIDC login succeeded but accessToken cookie was not set."
    );
  }

  // Verify the CSRF cookie is also present
  const csrfCookie = cookies.find((c) => c.name === "csrfToken");
  if (!csrfCookie) {
    throw new Error("CSRF cookie was not set after OIDC login.");
  }

  return { context, page };
}

/**
 * Creates a clean browser context with no cookies (anonymous user).
 */
export async function createAnonymousContext(
  browser: Browser
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  return { context, page };
}

/**
 * Retrieves the CSRF token from the browser's cookies.
 */
export async function getCsrfToken(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  const csrf = cookies.find((c) => c.name === "csrfToken");
  if (!csrf) {
    throw new Error("CSRF cookie not found");
  }
  return csrf.value;
}
