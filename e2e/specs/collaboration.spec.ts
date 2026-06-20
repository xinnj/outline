import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { loginViaOIDC } from "../helpers/auth";
import { createCollection, createDoc } from "../helpers/api";

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

let user1: { context: BrowserContext; page: Page };
let user2: { context: BrowserContext; page: Page };
let collectionId: string;
let basePath: string;

test.describe("Collaborative editing", () => {
  test.beforeAll(async ({ browser }) => {
    basePath = resolveBasePath();

    // Authenticate two independent browser contexts. Use the same admin
    // account but separate cookie jars — Outline treats them as distinct
    // sessions.
    user1 = await loginViaOIDC(browser, basePath);
    user2 = await loginViaOIDC(browser, basePath);

    const collection = await createCollection(user1.page, basePath, {
      name: "E2E Collab Test Collection",
    });
    collectionId = collection.id;
  });

  test.afterAll(async () => {
    // Clean up the test collection
    try {
      const csrfToken =
        (await user1.context.cookies()).find((c) => c.name === "csrfToken")
          ?.value ?? "";
      const accessToken =
        (await user1.context.cookies()).find((c) => c.name === "accessToken")
          ?.value ?? "";
      await user1.page.request.post(`${basePath}/api/collections.delete`, {
        headers: {
          cookie: `csrfToken=${csrfToken}; accessToken=${accessToken}`,
          "x-csrf-token": csrfToken,
          "content-type": "application/json",
        },
        data: { id: collectionId },
      });
    } catch {
      // Ignore cleanup errors
    }
    await user1.context.close();
    await user2.context.close();
  });

  test("should sync typed content in real-time between two sessions", async () => {
    // Create a document via API
    const doc = await createDoc(user1.page, basePath, {
      title: "Real-time Collab Test",
      text: "Initial content.",
      collectionId,
    });

    // Both users open the same document
    await user1.page.goto(`${basePath}${doc.url}`);
    await user1.page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/documents.info"),
      { timeout: 15000 }
    );

    await user2.page.goto(`${basePath}${doc.url}`);
    await user2.page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/documents.info"),
      { timeout: 15000 }
    );

    // Wait for both editors to be ready
    const editor1 = user1.page
      .getByRole("textbox", { name: "Editor content" })
      .first();
    const editor2 = user2.page
      .getByRole("textbox", { name: "Editor content" })
      .first();
    await expect(editor1).toBeVisible({ timeout: 10000 });
    await expect(editor2).toBeVisible({ timeout: 10000 });

    // User 1 types new content
    await editor1.click();
    const user1Text = "Hello from User 1 — via Y.js sync!";
    // Clear default paragraph content first
    await user1.page.keyboard.press("End");
    await user1.page.keyboard.type(`\n${user1Text}`, { delay: 10 });

    // User 2 should see the new text appear in real-time
    await expect(
      user2.page.locator(`text=${user1Text}`).first()
    ).toBeVisible({ timeout: 20000 });

    // User 2 types — User 1 should see it
    await editor2.click();
    await user2.page.keyboard.press("End");
    const user2Text = "Hello from User 2 — also synced!";
    await user2.page.keyboard.type(`\n${user2Text}`, { delay: 10 });

    await expect(
      user1.page.locator(`text=${user2Text}`).first()
    ).toBeVisible({ timeout: 20000 });
  });

  test("should reflect document title change across sessions", async () => {
    const doc = await createDoc(user1.page, basePath, {
      title: "Original Collab Title",
      text: "Content for title sync test.",
      collectionId,
    });

    // Both users open the same document
    await user1.page.goto(`${basePath}${doc.url}`);
    await user1.page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/documents.info"),
      { timeout: 15000 }
    );

    await user2.page.goto(`${basePath}${doc.url}`);
    await user2.page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/documents.info"),
      { timeout: 15000 }
    );

    // User 2 should see the original title
    await expect(
      user2.page.locator("text=Original Collab Title").first()
    ).toBeVisible({ timeout: 10000 });

    // User 1 changes the title — the document title is the first textbox
    // on the page (aria-label varies by locale).
    const titleInput = user1.page.locator('[role="textbox"]').first();
    await expect(titleInput).toBeVisible({ timeout: 5000 });
    await titleInput.clear();
    const newTitle = "Synced Title — Real-time!";
    await titleInput.fill(newTitle);

    // User 2 should see the updated title via Y.js sync
    await expect(
      user2.page.locator(`text=${newTitle}`).first()
    ).toBeVisible({ timeout: 20000 });
  });
});
