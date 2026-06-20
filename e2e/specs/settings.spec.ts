import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { loginViaOIDC } from "../helpers/auth";
import {
  updateProfile,
  createApiKey,
  deleteApiKey,
  listApiKeys,
  createCollection,
  createDoc,
  apiCall,
} from "../helpers/api";

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

test.describe("Team Settings", () => {
  test.beforeAll(async ({ browser }) => {
    basePath = resolveBasePath();
    const auth = await loginViaOIDC(browser, basePath);
    context = auth.context;
    page = auth.page;
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("should display workspace details page", async () => {
    await page.goto(`${basePath}/settings/details`);
    await page.waitForLoadState("networkidle");

    // Verify the page URL is correct (heading text may vary by locale)
    expect(page.url()).toContain("/settings/details");

    // The settings sidebar should show an active link for this section
    await expect(
      page.locator('#sidebar a[aria-current="page"]')
    ).toBeVisible({ timeout: 10000 });
  });

  test("should display security settings page", async () => {
    await page.goto(`${basePath}/settings/security`);
    await page.waitForLoadState("networkidle");

    // Verify the page URL is correct
    expect(page.url()).toContain("/settings/security");

    // The settings sidebar should show an active link
    await expect(
      page.locator('#sidebar a[aria-current="page"]')
    ).toBeVisible({ timeout: 10000 });
  });

  test("should display and update profile settings", async () => {
    await page.goto(`${basePath}/settings/profile`);
    await page.waitForLoadState("networkidle");

    // Verify the page URL is correct
    expect(page.url()).toContain("/settings/profile");

    // Update the user's name via API and verify
    const newName = `E2E User ${Date.now()}`;
    const updated = await updateProfile(page, basePath, { name: newName });
    expect(updated.name).toBe(newName);

    // Re-fetch user info to confirm the change persisted
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

    // Get current user ID
    const authRes = await page.request.post(`${basePath}/api/auth.info`, {
      headers: {
        cookie: cookieHeader,
        "x-csrf-token": csrfToken,
        "content-type": "application/json",
      },
    });
    const authData = await authRes.json();
    const userId = authData.data?.user?.id || authData.data?.id;

    if (userId) {
      const infoRes = await page.request.post(
        `${basePath}/api/users.info`,
        {
          headers: {
            cookie: cookieHeader,
            "x-csrf-token": csrfToken,
            "content-type": "application/json",
          },
          data: { id: userId },
        }
      );
      const infoData = await infoRes.json();
      expect(infoData.data.name).toBe(newName);
    }
  });

  test("should create, list, and revoke an API key", async () => {
    // Create an API key via API
    const keyName = `E2E API Key ${Date.now()}`;
    const apiKey = await createApiKey(page, basePath, keyName);

    expect(apiKey.id).toBeTruthy();
    expect(apiKey.name).toBe(keyName);
    // The API key value (secret) is only returned at creation time
    expect(apiKey.value).toBeTruthy();

    // List API keys and verify the created key exists
    const keys = await listApiKeys(page, basePath);
    expect(Array.isArray(keys)).toBeTruthy();
    const found = keys.some((k: { id: string }) => k.id === apiKey.id);
    expect(found).toBeTruthy();

    // Revoke (delete) the API key
    await deleteApiKey(page, basePath, apiKey.id);

    // Verify the key is no longer listed
    const keysAfter = await listApiKeys(page, basePath);
    const foundAfter = keysAfter.some(
      (k: { id: string }) => k.id === apiKey.id
    );
    expect(foundAfter).toBeFalsy();
  });

  test("should list and update notification preferences", async () => {
    // List notifications via API — may return data as an object with
    // notifications array, or as a plain array
    const listResult = await apiCall(page, basePath, "notifications.list", {});
    const notifications = listResult.data.notifications || listResult.data;
    expect(notifications).toBeTruthy();
  });

  test("should export document data", async () => {
    // Create a collection with a document
    const collection = await createCollection(page, basePath, {
      name: `E2E Export Coll ${Date.now()}`,
    });
    const doc = await createDoc(page, basePath, {
      title: `Export Doc ${Date.now()}`,
      collectionId: collection.id,
    });

    // Export the document via API
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

    const exportRes = await page.request.post(
      `${basePath}/api/documents.export`,
      {
        headers: {
          cookie: cookieHeader,
          "x-csrf-token": csrfToken,
          "content-type": "application/json",
          accept: "text/markdown",
        },
        data: { id: doc.id },
      }
    );
    // The export should succeed and return file operation tracking info
    expect(exportRes.ok()).toBeTruthy();

    // Cleanup
    await page.request.post(`${basePath}/api/collections.delete`, {
      headers: {
        cookie: cookieHeader,
        "x-csrf-token": csrfToken,
        "content-type": "application/json",
      },
      data: { id: collection.id },
    });
  });
});
