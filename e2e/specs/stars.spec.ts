import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { loginViaOIDC } from "../helpers/auth";
import {
  createCollection,
  createDoc,
  starDoc,
  unstarDoc,
  pinDoc,
  unpinDoc,
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

test.describe("Stars & Pins", () => {
  test.beforeAll(async ({ browser }) => {
    basePath = resolveBasePath();
    const auth = await loginViaOIDC(browser, basePath);
    context = auth.context;
    page = auth.page;
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("should star a document", async () => {
    const collection = await createCollection(page, basePath, {
      name: `E2E Star Coll ${Date.now()}`,
    });
    const doc = await createDoc(page, basePath, {
      title: `Star Test Doc ${Date.now()}`,
      collectionId: collection.id,
    });

    // Star the document via API
    const star = await starDoc(page, basePath, doc.id);
    expect(star.id).toBeTruthy();

    // Verify the star appears in the user's star list
    const starsResult = await apiCall(page, basePath, "stars.list", {});
    expect(Array.isArray(starsResult.data.stars)).toBeTruthy();
    const found = starsResult.data.stars.some(
      (s: { documentId: string }) => s.documentId === doc.id
    );
    expect(found).toBeTruthy();

    // Cleanup
    await unstarDoc(page, basePath, star.id);

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

  test("should unstar a document", async () => {
    const collection = await createCollection(page, basePath, {
      name: `E2E Unstar Coll ${Date.now()}`,
    });
    const doc = await createDoc(page, basePath, {
      title: `Unstar Test Doc ${Date.now()}`,
      collectionId: collection.id,
    });

    // Star then unstar via API
    const star = await starDoc(page, basePath, doc.id);
    await unstarDoc(page, basePath, star.id);

    // Verify the star is no longer in the user's star list
    const starsResult = await apiCall(page, basePath, "stars.list", {});
    const found = starsResult.data.stars.some(
      (s: { documentId: string }) => s.documentId === doc.id
    );
    expect(found).toBeFalsy();

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

  test("should pin a document to a collection", async () => {
    const collection = await createCollection(page, basePath, {
      name: `E2E Pin Coll ${Date.now()}`,
    });
    const doc = await createDoc(page, basePath, {
      title: `Pin Test Doc ${Date.now()}`,
      collectionId: collection.id,
    });

    // Pin the document to the collection via API
    const pin = await pinDoc(page, basePath, doc.id, collection.id);
    expect(pin.id).toBeTruthy();

    // Verify the pin via pins.list
    const pinsResult = await apiCall(page, basePath, "pins.list", {
      collectionId: collection.id,
    });
    expect(Array.isArray(pinsResult.data.pins)).toBeTruthy();
    const found = pinsResult.data.pins.some(
      (p: { documentId: string }) => p.documentId === doc.id
    );
    expect(found).toBeTruthy();

    // Cleanup
    await unpinDoc(page, basePath, pin.id);

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

  test("should unpin a document", async () => {
    const collection = await createCollection(page, basePath, {
      name: `E2E Unpin Coll ${Date.now()}`,
    });
    const doc = await createDoc(page, basePath, {
      title: `Unpin Test Doc ${Date.now()}`,
      collectionId: collection.id,
    });

    // Pin then unpin via API
    const pin = await pinDoc(page, basePath, doc.id, collection.id);
    await unpinDoc(page, basePath, pin.id);

    // Verify the pin is no longer in the list
    const pinsResult = await apiCall(page, basePath, "pins.list", {
      collectionId: collection.id,
    });
    const found = pinsResult.data.pins.some(
      (p: { documentId: string }) => p.documentId === doc.id
    );
    expect(found).toBeFalsy();

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
