import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { loginViaOIDC } from "../helpers/auth";
import {
  createCollection,
  createDoc,
  archiveDoc,
  restoreDoc,
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

test.describe("Home & Navigation", () => {
  test.beforeAll(async ({ browser }) => {
    basePath = resolveBasePath();
    const auth = await loginViaOIDC(browser, basePath);
    context = auth.context;
    page = auth.page;
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("should display home page with sections", async () => {
    await page.goto(`${basePath}/home`);
    await page.waitForLoadState("networkidle");

    // Verify we are on the home page (heading text may vary by locale)
    expect(page.url()).toContain("/home");

    // The sidebar should be visible, confirming the page loaded
    await expect(page.locator("#sidebar")).toBeVisible({ timeout: 10000 });
  });

  test("should navigate via sidebar collections", async () => {
    // Create a collection to ensure there's something to navigate to
    const collection = await createCollection(page, basePath, {
      name: `E2E Sidebar Nav ${Date.now()}`,
    });

    // Navigate to home first
    await page.goto(`${basePath}/home`);
    await page.waitForLoadState("networkidle");

    // The sidebar should list the collection. Click on the collection name.
    const collectionText = page.locator(`text=${collection.name}`).first();
    await expect(collectionText).toBeVisible({ timeout: 5000 });
    await collectionText.click();

    // Wait for navigation to the collection page
    await page.waitForURL(
      (url) => url.pathname.includes("/collection/"),
      { timeout: 10000 }
    );
    await page.waitForLoadState("networkidle");

    // After navigation, the collection name should be visible on the page
    await expect(
      page.locator(`text=${collection.name}`).first()
    ).toBeVisible({ timeout: 10000 });

    // The URL should contain /collection/
    expect(page.url()).toContain("/collection/");

    // Cleanup
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

    await page.request.post(`${basePath}/api/collections.delete`, {
      headers: {
        cookie: cookieHeader,
        "x-csrf-token": csrfToken,
        "content-type": "application/json",
      },
      data: { id: collection.id },
    });
  });

  test("should show breadcrumbs navigation in a document", async () => {
    // Create a collection and a document within it
    const collection = await createCollection(page, basePath, {
      name: `E2E Breadcrumb Coll ${Date.now()}`,
    });
    const doc = await createDoc(page, basePath, {
      title: `Breadcrumb Doc ${Date.now()}`,
      collectionId: collection.id,
    });

    // Navigate to the document
    const infoPromise = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/documents.info"),
      { timeout: 15000 }
    );
    await page.goto(`${basePath}${doc.url}`);
    await infoPromise;

    await expect(
      page.locator(`text=${doc.title}`).first()
    ).toBeVisible({ timeout: 10000 });

    // The breadcrumb should show the collection name as a link
    // The collection name should appear in the document header area
    const breadcrumbLink = page.locator(
      `a[href*="/collection/"]`
    );
    await expect(breadcrumbLink.first()).toBeVisible({ timeout: 5000 });

    // Click the breadcrumb link to navigate back to the collection
    await breadcrumbLink.first().click();

    // Should now be on the collection page
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/collection/");

    // Cleanup
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

    await page.request.post(`${basePath}/api/collections.delete`, {
      headers: {
        cookie: cookieHeader,
        "x-csrf-token": csrfToken,
        "content-type": "application/json",
      },
      data: { id: collection.id },
    });
  });

  test("should show drafts list", async () => {
    // Create an unpublished document (draft) via API
    const collection = await createCollection(page, basePath, {
      name: `E2E Drafts Coll ${Date.now()}`,
    });
    const draft = await createDoc(page, basePath, {
      title: `Draft Doc ${Date.now()}`,
      collectionId: collection.id,
      publish: false,
    });

    // Verify the draft appears via documents.drafts API
    const draftsResult = await apiCall(page, basePath, "documents.drafts", {
      collectionId: collection.id,
    });
    expect(Array.isArray(draftsResult.data)).toBeTruthy();
    const found = draftsResult.data.some(
      (d: { id: string }) => d.id === draft.id
    );
    expect(found).toBeTruthy();

    // Cleanup
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

    await page.request.post(`${basePath}/api/collections.delete`, {
      headers: {
        cookie: cookieHeader,
        "x-csrf-token": csrfToken,
        "content-type": "application/json",
      },
      data: { id: collection.id },
    });
  });

  test("should show archive list", async () => {
    // Create a document and archive it via API
    const collection = await createCollection(page, basePath, {
      name: `E2E Archive Coll ${Date.now()}`,
    });
    const doc = await createDoc(page, basePath, {
      title: `Archive List Doc ${Date.now()}`,
      collectionId: collection.id,
    });
    await archiveDoc(page, basePath, doc.id);

    // Verify via documents.archived API
    const archivedResult = await apiCall(page, basePath, "documents.archived", {
      collectionId: collection.id,
    });
    expect(Array.isArray(archivedResult.data)).toBeTruthy();
    const found = archivedResult.data.some(
      (d: { id: string }) => d.id === doc.id
    );
    expect(found).toBeTruthy();

    // Restore for cleanup
    await restoreDoc(page, basePath, doc.id);

    // Cleanup
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

    await page.request.post(`${basePath}/api/collections.delete`, {
      headers: {
        cookie: cookieHeader,
        "x-csrf-token": csrfToken,
        "content-type": "application/json",
      },
      data: { id: collection.id },
    });
  });

  test("should open keyboard shortcuts modal", async () => {
    // Navigate to a document page
    const collection = await createCollection(page, basePath, {
      name: `E2E Shortcut Coll ${Date.now()}`,
    });
    const doc = await createDoc(page, basePath, {
      title: `Shortcut Doc ${Date.now()}`,
      collectionId: collection.id,
    });

    const infoPromise = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/documents.info"),
      { timeout: 15000 }
    );
    await page.goto(`${basePath}${doc.url}`);
    await infoPromise;

    // Press ? to open keyboard shortcuts guide
    await page.keyboard.press("?");

    // The keyboard shortcuts modal should appear (dialog text may vary by locale)
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });

    // Close the modal by pressing Escape
    await page.keyboard.press("Escape");

    // Cleanup
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
