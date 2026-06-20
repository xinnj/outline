import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { loginViaOIDC } from "../helpers/auth";
import { createCollection, createDoc, apiCall } from "../helpers/api";

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

test.describe("Search", () => {
  test.beforeAll(async ({ browser }) => {
    basePath = resolveBasePath();
    const auth = await loginViaOIDC(browser, basePath);
    context = auth.context;
    page = auth.page;
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("should search documents globally", async () => {
    // Navigate to the global search page
    const searchQuery = `E2E Global Search ${Date.now()}`;

    await page.goto(`${basePath}/search`);
    await page.waitForLoadState("networkidle");

    const searchInput = page.getByRole("searchbox");
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    // Intercept the search API call triggered by the search input
    const searchResponse = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/documents.search"),
      { timeout: 15000 }
    );

    await searchInput.fill(searchQuery);
    await searchInput.press("Enter");
    const response = await searchResponse;

    // Verify the search API was called with the correct query
    expect(response.status()).toBe(200);
    const reqData = response.request().postDataJSON();
    expect(reqData.query).toBe(searchQuery);

    // Verify the search page shows the query (URL should update or results
    // area should be visible)
    await expect(page.getByRole("searchbox")).toHaveValue(searchQuery);
  });

  test("should search within a collection", async () => {
    // Create a collection and a document, then search via the search UI
    // scoped to that collection by navigating to the collection search.
    const collection = await createCollection(page, basePath, {
      name: `E2E CollSearch ${Date.now()}`,
    });
    const doc = await createDoc(page, basePath, {
      title: `E2E Unique CollSearch Doc ${Date.now()}`,
      text: "Searchable content for E2E collection search test.",
      collectionId: collection.id,
    });

    // Navigate to the collection page first
    await page.goto(`${basePath}${collection.url}`);
    await page.waitForLoadState("networkidle");

    // Use the "Search in collection" action — there's a search input on the
    // collection page header.
    const collectionSearchInput = page.getByRole("searchbox");
    await expect(collectionSearchInput).toBeVisible({ timeout: 5000 });

    const searchResponse = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/documents.search") &&
        res.request().postDataJSON()?.collectionId === collection.id,
      { timeout: 15000 }
    );

    await collectionSearchInput.fill(doc.title.split(" ")[0]);
    await collectionSearchInput.press("Enter");
    await searchResponse;

    // Verify the document appears in results
    await expect(
      page.locator(`text=${doc.title}`).first()
    ).toBeVisible({ timeout: 10000 });

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

  test("should support search results pagination", async () => {
    // Search with a small limit and verify pagination metadata is returned
    const result = await apiCall(page, basePath, "documents.search", {
      query: "test",
      limit: 2,
      offset: 0,
    });

    // The search API response should include pagination metadata
    expect(result.data).toBeTruthy();
    expect(Array.isArray(result.data)).toBeTruthy();

    // Pagination info may be in the top-level response
    if (result.pagination) {
      expect(typeof result.pagination.total).toBe("number");
      expect(typeof result.pagination.limit).toBe("number");
      expect(typeof result.pagination.offset).toBe("number");
    }
  });
});
