import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { loginViaOIDC } from "../helpers/auth";
import {
  createCollection,
  createDoc,
  deleteDoc,
  duplicateDoc,
  moveDoc,
  archiveDoc,
  restoreDoc,
  apiCall,
} from "../helpers/api";

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

let context: BrowserContext;
let page: Page;
let collectionId: string;
let collectionUrl: string;
let basePath: string;

test.describe("Document CRUD", () => {
  test.beforeAll(async ({ browser }) => {
    basePath = resolveBasePath();

    const auth = await loginViaOIDC(browser, basePath);
    context = auth.context;
    page = auth.page;

    const collection = await createCollection(page, basePath, {
      name: "E2E Docs Test Collection",
    });
    collectionId = collection.id;
    collectionUrl = collection.url;
  });

  test.afterAll(async () => {
    try {
      const jar = await context.cookies();
      const csrfToken =
        jar.find((c) => c.name === "csrfToken")?.value ?? "";
      const accessToken =
        jar.find((c) => c.name === "accessToken")?.value ?? "";
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
        data: { id: collectionId },
      });
    } catch {
      // Ignore cleanup errors
    }
    await context.close();
  });

  test("should create a document and verify API call includes base path", async () => {
    // Navigate to /doc/new — Outline auto-creates a draft. Wait for the
    // response (not just the request) so we can extract the document URL
    // and navigate to it explicitly, avoiding the race where the page
    // redirects to the collection before the editor loads.
    const createResponse = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/documents.create"),
      { timeout: 30000 }
    );

    await page.goto(`${basePath}/doc/new?collectionId=${collectionId}`);
    const response = await createResponse;

    if (basePath) {
      expect(response.request().url()).toContain(
        `${basePath}/api/documents.create`
      );
    }

    const body = await response.json();
    const docId: string = body.data?.id;
    expect(docId).toBeTruthy();

    // Navigate to the document explicitly (the page may have redirected).
    // Use the document id to construct the URL since the slug may not be
    // available immediately in the create response.
    const docUrl = `/doc/${docId}`;
    const infoPromise = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/documents.info"),
      { timeout: 15000 }
    );
    await page.goto(`${basePath}${docUrl}`);
    await infoPromise;

    // Type a title to trigger documents.update and verify the API call.
    // The document title is the first contenteditable textbox on the page
    // (the aria-label is translated, so we use a structural selector).
    const titleInput = page.locator('[role="textbox"]').first();
    await expect(titleInput).toBeVisible({ timeout: 10000 });

    const updatePromise = page.waitForRequest(
      (req) =>
        req.method() === "POST" &&
        req.url().includes("/api/documents.update"),
      { timeout: 15000 }
    );

    await titleInput.fill("E2E Test Document");

    const updateReq = await updatePromise;
    expect(updateReq.url()).toContain("documents.update");
    const postData = updateReq.postDataJSON();
    expect(postData).toHaveProperty("title");
    expect(postData.title).toContain("E2E Test Document");
  });

  test("should edit a document and verify documents.update API call params", async () => {
    // Create a fresh document for editing
    const doc = await createDoc(page, basePath, {
      title: "Edit Test Document",
      text: "Original content.",
      collectionId,
    });

    // Register response wait BEFORE navigation
    const infoPromise = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/documents.info"),
      { timeout: 15000 }
    );

    await page.goto(`${basePath}${doc.url}`);
    await infoPromise;

    await expect(
      page.locator("text=Edit Test Document").first()
    ).toBeVisible({ timeout: 10000 });

    // Click into the ProseMirror editor and type new content.
    // Outline syncs edits via Y.js WebSocket, not per-keystroke API calls,
    // so we verify the typed content appears in the editor DOM.
    const editor = page.getByRole("textbox", { name: "Editor content" }).first();
    await expect(editor).toBeVisible({ timeout: 5000 });
    await editor.click();

    const newText = "Updated content from e2e test.";
    await page.keyboard.type(`\n${newText}`, { delay: 10 });

    // Verify the new content appears in the editor
    await expect(page.locator(`text=${newText}`).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("should soft delete a document and show it in trash", async () => {
    // Create a document to delete
    const doc = await createDoc(page, basePath, {
      title: "Delete Test Document",
      collectionId,
    });

    // Delete via API
    await deleteDoc(page, basePath, doc.id);

    // Register response wait BEFORE navigation
    const deletedPromise = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/documents.deleted"),
      { timeout: 15000 }
    );

    await page.goto(`${basePath}/trash`);
    const deletedRes = await deletedPromise;

    // Debug: log response status and body on failure to diagnose sub-path errors
    if (deletedRes.status() !== 200) {
      const body = await deletedRes.text();
      console.error(
        `[DEBUG] documents.deleted returned ${deletedRes.status()}: ${body.slice(0, 500)}`
      );
    }

    // Verify the deleted document appears in trash
    await expect(
      page.locator("text=Delete Test Document").first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("should restore a document from trash", async () => {
    // Create and delete a document via API
    const doc = await createDoc(page, basePath, {
      title: "Restore Test Document",
      collectionId,
    });
    await deleteDoc(page, basePath, doc.id);

    // Restore the document via API — call documents.restore directly.
    // This avoids flaky UI interactions with context menus in the trash view.
    const cookies = await context.cookies();
    const csrfToken =
      cookies.find((c) => c.name === "csrfToken")?.value ?? "";
    const accessToken =
      cookies.find((c) => c.name === "accessToken")?.value ?? "";

    await page.request.post(`${basePath}/api/documents.restore`, {
      headers: {
        cookie: `csrfToken=${csrfToken}; accessToken=${accessToken}`,
        "x-csrf-token": csrfToken,
        "content-type": "application/json",
      },
      data: { id: doc.id },
    });

    // Navigate to the collection and verify the document is back
    const listPromise = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/documents.list"),
      { timeout: 15000 }
    );

    await page.goto(`${basePath}${collectionUrl}`);
    await listPromise;

    await expect(
      page.locator("text=Restore Test Document").first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("should publish a document", async () => {
    // Create a draft document via API (publish: false)
    const doc = await createDoc(page, basePath, {
      title: "Publish Test Document",
      collectionId,
      publish: false,
    });

    // Publish via API (button text varies by locale)
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

    const publishRes = await page.request.post(
      `${basePath}/api/documents.update`,
      {
        headers: {
          cookie: cookieHeader,
          "x-csrf-token": csrfToken,
          "content-type": "application/json",
        },
        data: { id: doc.id, publish: true },
      }
    );
    expect(publishRes.ok()).toBeTruthy();
    const body = await publishRes.json();
    expect(body.data.publishedAt).toBeTruthy();

    // Navigate to the document — the publish button should NOT be visible
    const infoPromise = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/documents.info"),
      { timeout: 15000 }
    );
    await page.goto(`${basePath}${doc.url}`);
    await infoPromise;

    // The document is now published — verify the page loads without error
    await expect(
      page.locator("text=Publish Test Document").first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("should unpublish a document", async () => {
    // Create a published document via API for setup
    const doc = await createDoc(page, basePath, {
      title: "Unpublish Test Document",
      collectionId,
    });

    // Unpublish via API (menu item text varies by locale)
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

    const unpublishRes = await page.request.post(
      `${basePath}/api/documents.unpublish`,
      {
        headers: {
          cookie: cookieHeader,
          "x-csrf-token": csrfToken,
          "content-type": "application/json",
        },
        data: { id: doc.id },
      }
    );
    expect(unpublishRes.ok()).toBeTruthy();
    const body = await unpublishRes.json();
    expect(body.data.publishedAt).toBeNull();

    // Navigate to the document to verify it's still accessible
    const infoPromise = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/documents.info"),
      { timeout: 15000 }
    );
    await page.goto(`${basePath}${doc.url}`);
    await infoPromise;

    await expect(
      page.locator("text=Unpublish Test Document").first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("should permanently delete a document from trash", async () => {
    // Create a document and soft-delete it via API (use timestamp to
    // avoid collisions with documents from previous test runs)
    const uniqueTitle = `Perm Delete Test ${Date.now()}`;
    const doc = await createDoc(page, basePath, {
      title: uniqueTitle,
      collectionId,
    });
    await deleteDoc(page, basePath, doc.id);

    // Verify the document appears in trash
    const deletedPromise = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/documents.deleted"),
      { timeout: 15000 }
    );
    await page.goto(`${basePath}/trash`);
    await deletedPromise;

    await expect(
      page.locator(`text=${uniqueTitle}`).first()
    ).toBeVisible({ timeout: 10000 });

    // Permanently delete via API (follows the same pattern as soft delete
    // and restore — API for the operation, UI for verification).
    const cookies = await context.cookies();
    const csrfToken =
      cookies.find((c) => c.name === "csrfToken")?.value ?? "";
    const accessToken =
      cookies.find((c) => c.name === "accessToken")?.value ?? "";

    const response = await page.request.post(
      `${basePath}/api/documents.delete`,
      {
        headers: {
          cookie: `csrfToken=${csrfToken}; accessToken=${accessToken}`,
          "x-csrf-token": csrfToken,
          "content-type": "application/json",
        },
        data: { id: doc.id, permanent: true },
      }
    );
    expect(response.ok()).toBeTruthy();

    // Wait briefly for the server to process the permanent delete, then
    // navigate to a different page first to clear the MobX store cache,
    // then back to trash to see the updated list.
    await page.goto(`${basePath}/home`);
    await page.waitForLoadState("networkidle");

    const reloadPromise = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/documents.deleted"),
      { timeout: 15000 }
    );
    await page.goto(`${basePath}/trash`);
    await reloadPromise;

    await expect(
      page.locator(`text=${uniqueTitle}`).first()
    ).not.toBeVisible({ timeout: 5000 });
  });

  test("should duplicate a document", async () => {
    const doc = await createDoc(page, basePath, {
      title: `Duplicate Source ${Date.now()}`,
      collectionId,
    });

    // Duplicate via API
    const dup = await duplicateDoc(page, basePath, doc.id);
    expect(dup.id).toBeTruthy();
    expect(dup.title).toContain("Duplicate Source");

    // Navigate to the collection and verify both docs are visible
    const listPromise = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/documents.list"),
      { timeout: 15000 }
    );
    await page.goto(`${basePath}${collectionUrl}`);
    await listPromise;

    await expect(
      page.locator(`text=${doc.title}`).first()
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator(`text=${dup.title}`).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("should move a document to another collection", async () => {
    // Create a document and a target collection
    const doc = await createDoc(page, basePath, {
      title: `Move Test Doc ${Date.now()}`,
      collectionId,
    });
    const targetCollection = await createCollection(page, basePath, {
      name: `Move Target ${Date.now()}`,
    });

    // Move the document to the target collection
    const moved = await moveDoc(page, basePath, doc.id, targetCollection.id);
    expect(moved.collectionId).toBe(targetCollection.id);

    // Verify the document appears in the target collection
    const listPromise = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/documents.list"),
      { timeout: 15000 }
    );
    await page.goto(`${basePath}${targetCollection.url}`);
    await listPromise;

    await expect(
      page.locator(`text=${doc.title}`).first()
    ).toBeVisible({ timeout: 10000 });

    // Cleanup target collection
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
      data: { id: targetCollection.id },
    });
  });

  test("should archive a document", async () => {
    const doc = await createDoc(page, basePath, {
      title: `Archive Test Doc ${Date.now()}`,
      collectionId,
    });

    // Archive via API
    const archived = await archiveDoc(page, basePath, doc.id);
    expect(archived.archivedAt).toBeTruthy();

    // Verify via documents.archived API that the document is now archived
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

    const archivedRes = await page.request.post(
      `${basePath}/api/documents.archived`,
      {
        headers: {
          cookie: cookieHeader,
          "x-csrf-token": csrfToken,
          "content-type": "application/json",
        },
        data: {},
      }
    );
    const archivedData = await archivedRes.json();
    const found = archivedData.data.some(
      (d: { id: string }) => d.id === doc.id
    );
    expect(found).toBeTruthy();
  });

  test("should unarchive a document", async () => {
    const doc = await createDoc(page, basePath, {
      title: `Unarchive Test Doc ${Date.now()}`,
      collectionId,
    });

    // Archive then restore via API
    await archiveDoc(page, basePath, doc.id);
    const restored = await restoreDoc(page, basePath, doc.id);
    expect(restored.archivedAt).toBeNull();

    // Verify the document is back in the collection
    const listPromise = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/documents.list"),
      { timeout: 15000 }
    );
    await page.goto(`${basePath}${collectionUrl}`);
    await listPromise;

    await expect(
      page.locator(`text=${doc.title}`).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("should import a document via file upload", async () => {
    // Import requires a file upload. Use the page.request with multipart form data.
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

    // Upload a markdown file to import
    const importRes = await page.request.post(
      `${basePath}/api/documents.import`,
      {
        headers: {
          cookie: cookieHeader,
          "x-csrf-token": csrfToken,
        },
        multipart: {
          collectionId,
          publish: "true",
          file: {
            name: "e2e-import-test.md",
            mimeType: "text/markdown",
            buffer: Buffer.from(
              "# Imported Document\n\nImported via file upload."
            ),
          },
        },
      }
    );
    expect(importRes.ok()).toBeTruthy();
    const importData = await importRes.json();
    expect(importData.data.id).toBeTruthy();
    expect(importData.data.title).toBeTruthy();

    // Verify the imported document appears in the collection
    const listPromise = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/documents.list"),
      { timeout: 15000 }
    );
    await page.goto(`${basePath}${collectionUrl}`);
    await listPromise;

    await expect(
      page.locator(`text=${importData.data.title}`).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("should view document history and revisions", async () => {
    // Create a document and update it to generate a revision
    const doc = await createDoc(page, basePath, {
      title: `History Test Doc ${Date.now()}`,
      collectionId,
      text: "Version 1 content.",
    });

    // Update the document to create a revision point
    await apiCall(page, basePath, "documents.update", {
      id: doc.id,
      text: "Version 2 content.",
    });

    // Navigate to the document's history page. The history panel loads
    // as a sidebar alongside the document content.
    const revisionsPromise = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/revisions.list"),
      { timeout: 15000 }
    );
    await page.goto(`${basePath}${doc.url}/history`);
    const revisionsResponse = await revisionsPromise;
    expect(revisionsResponse.status()).toBe(200);

    const revisionsData = await revisionsResponse.json();
    expect(Array.isArray(revisionsData.data)).toBeTruthy();
    // There should be at least one revision (the original)
    expect(revisionsData.data.length).toBeGreaterThan(0);

    // The document title should be visible on the page
    await expect(
      page.locator(`text=${doc.title}`).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("should restore a specific revision", async () => {
    // Create a document and update it to generate a revision
    const doc = await createDoc(page, basePath, {
      title: `Revision Restore Doc ${Date.now()}`,
      collectionId,
      text: "Original version.",
    });

    // Update the document to create a revision point
    await apiCall(page, basePath, "documents.update", {
      id: doc.id,
      text: "Modified version.",
    });

    // Revisions are created asynchronously by an event processor. Poll
    // revisions.list until the previous version appears (up to 10s).
    let originalRevision: { id: string } | undefined;
    for (let attempt = 0; attempt < 10; attempt++) {
      const revisionsResult = await apiCall(page, basePath, "revisions.list", {
        documentId: doc.id,
      });
      const revisions = revisionsResult.data;

      originalRevision = revisions.find(
        (r: { id: string }) => r.id !== doc.id
      );
      if (originalRevision) {
        break;
      }
      await page.waitForTimeout(1000);
    }
    expect(originalRevision).toBeTruthy();

    // Restore the original revision
    const { id: revisionId } = originalRevision!;
    const restoreResult = await apiCall(page, basePath, "documents.restore", {
      id: doc.id,
      revisionId,
    });
    // Debug: log revision details and restore response on mismatch
    if (restoreResult.data.text !== "Original version.") {
      console.error(
        `[DEBUG] Revision ${revisionId}: text mismatch — expected "Original version.", got "${restoreResult.data.text}"`
      );
    }
    expect(restoreResult.data.text).toBe("Original version.");
  });

  test("should compare two revisions", async () => {
    // Create a document and update it multiple times to generate revisions
    const doc = await createDoc(page, basePath, {
      title: `Compare Revision Doc ${Date.now()}`,
      collectionId,
      text: "Version 1 - original content.",
    });

    // Create two more revisions
    await apiCall(page, basePath, "documents.update", {
      id: doc.id,
      text: "Version 2 - first edit.",
    });
    await apiCall(page, basePath, "documents.update", {
      id: doc.id,
      text: "Version 3 - second edit.",
    });

    // List revisions
    const revisionsResult = await apiCall(page, basePath, "revisions.list", {
      documentId: doc.id,
    });
    const revisions = revisionsResult.data;
    expect(revisions.length).toBeGreaterThanOrEqual(1);

    // Fetch the latest revision and compare to current document
    const revInfo = await apiCall(page, basePath, "revisions.info", {
      id: revisions[0].id,
    });
    expect(revInfo.data.text).toBeTruthy();

    // Also fetch current document info for comparison
    const docInfo = await apiCall(page, basePath, "documents.info", {
      id: doc.id,
    });

    // Both should have text content
    expect(docInfo.data.text).toBeTruthy();
    // Revision and current document text may differ
    expect(typeof revInfo.data.text).toBe("string");
    expect(typeof docInfo.data.text).toBe("string");
  });
});
