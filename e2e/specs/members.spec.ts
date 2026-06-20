import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { loginViaOIDC } from "../helpers/auth";
import { apiCall } from "../helpers/api";

function resolveBasePath(): string {
  const projectName = test.info().project.name;
  if (projectName === "chromium-subpath") {
    return process.env.E2E_SUBPATH || "/outline";
  }
  return "";
}

let context: BrowserContext;
let page: Page;
let basePath: string;

test.describe("User Management", () => {
  test.beforeAll(async ({ browser }) => {
    basePath = resolveBasePath();
    const auth = await loginViaOIDC(browser, basePath);
    context = auth.context;
    page = auth.page;
  });

  test.afterAll(async () => {
    await context.close();
  });

  async function getAuthCookies() {
    const cookies = await context.cookies();
    const csrfToken =
      cookies.find((c) => c.name === "csrfToken")?.value ?? "";
    const accessToken =
      cookies.find((c) => c.name === "accessToken")?.value ?? "";
    const cookieHeader = [
      `csrfToken=${csrfToken}`,
      accessToken ? `accessToken=${accessToken}` : "",
    ]
      .filter(Boolean)
      .join("; ");
    return { csrfToken, accessToken, cookieHeader };
  }

  test("should display members list", async () => {
    await page.goto(`${basePath}/settings/members`);
    await page.waitForLoadState("networkidle");

    // Verify the members page loaded (heading text may vary by locale)
    expect(page.url()).toContain("/settings/members");

    // The settings sidebar should be visible (there are two #sidebar elements
    // on the settings page — the collapsed app sidebar and the settings sidebar)
    await expect(page.locator("#sidebar").first()).toBeVisible({ timeout: 10000 });

    // The current user's name should appear in the list
    await expect(page.locator("text=admin").first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("should list users and verify expected fields", async () => {
    const { csrfToken, cookieHeader } = await getAuthCookies();

    const res = await page.request.post(`${basePath}/api/users.list`, {
      headers: {
        cookie: cookieHeader,
        "x-csrf-token": csrfToken,
        "content-type": "application/json",
      },
      data: {},
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data.data)).toBeTruthy();
    expect(data.data.length).toBeGreaterThan(0);

    // Verify required user fields exist
    const user = data.data[0];
    expect(user.id).toBeTruthy();
    expect(user.email).toBeTruthy();
    expect(user.name).toBeTruthy();
  });

  test("should get user info by ID", async () => {
    const { csrfToken, cookieHeader } = await getAuthCookies();

    // First list users to get an ID
    const listRes = await page.request.post(
      `${basePath}/api/users.list`,
      {
        headers: {
          cookie: cookieHeader,
          "x-csrf-token": csrfToken,
          "content-type": "application/json",
        },
        data: {},
      }
    );
    const listData = await listRes.json();
    const userId = listData.data[0]?.id;
    expect(userId).toBeTruthy();

    // Fetch user info
    const infoRes = await page.request.post(`${basePath}/api/users.info`, {
      headers: {
        cookie: cookieHeader,
        "x-csrf-token": csrfToken,
        "content-type": "application/json",
      },
      data: { id: userId },
    });
    expect(infoRes.ok()).toBeTruthy();
    const infoData = await infoRes.json();
    expect(infoData.data.id).toBe(userId);
    expect(infoData.data.email).toBeTruthy();
    expect(infoData.data.name).toBeTruthy();
  });

  test("should require auth for users.update_role", async () => {
    // Calling users.update_role without auth should be rejected
    const res = await page.request.post(
      `${basePath}/api/users.update_role`,
      {
        headers: { "content-type": "application/json" },
        data: {
          id: "00000000-0000-0000-0000-000000000000",
          role: "member",
        },
      }
    );
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test("should require auth for users.delete", async () => {
    // Calling users.delete without auth should be rejected
    const res = await page.request.post(`${basePath}/api/users.delete`, {
      headers: { "content-type": "application/json" },
      data: {
        id: "00000000-0000-0000-0000-000000000000",
      },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test("should filter members by query", async () => {
    // The users.list API supports a query parameter for filtering
    const result = await apiCall(page, basePath, "users.list", {
      query: "admin",
    });

    expect(Array.isArray(result.data)).toBeTruthy();
    expect(result.data.length).toBeGreaterThan(0);

    // All returned users should match the query (name or email contains "admin")
    for (const user of result.data) {
      const matches =
        (user.name && user.name.toLowerCase().includes("admin")) ||
        (user.email && user.email.toLowerCase().includes("admin"));
      expect(matches).toBeTruthy();
    }
  });
});
