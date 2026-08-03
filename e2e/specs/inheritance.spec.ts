import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { loginViaOIDC } from "../helpers/auth";
import {
  apiCall,
  apiCallRaw,
  createCollection,
  createDoc,
  addUserToCollection,
  addUserToDocument,
  deleteCollection,
} from "../helpers/api";
import { waitForApiRequest } from "../helpers/network";

function resolveBasePath(): string {
  const projectName = test.info().project.name;
  if (projectName === "chromium-subpath") {
    return process.env.E2E_SUBPATH || "/outline";
  }
  return "";
}

type NavigationNodeLike = { id: string; children?: NavigationNodeLike[] };

function containsDocId(nodes: NavigationNodeLike[], docId: string): boolean {
  return nodes.some(
    (node) => node.id === docId || containsDocId(node.children ?? [], docId)
  );
}

let context: BrowserContext;
let page: Page;
let basePath: string;
let adminUserId: string;

test.describe("Document permission inheritance", () => {
  test.beforeAll(async ({ browser }) => {
    basePath = resolveBasePath();
    const auth = await loginViaOIDC(browser, basePath);
    context = auth.context;
    page = auth.page;

    // The actor who toggles inheritance is the logged-in user, not necessarily
    // the first admin in users.list (a multi-admin team can have several).
    // users.info without an id returns the current user, like the viewer test.
    const info = await apiCall(page, basePath, "users.info", {});
    adminUserId = info.data.id;
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("new documents inherit permissions by default", async () => {
    const collection = await createCollection(page, basePath, {
      name: `E2E Inherit Default Coll ${Date.now()}`,
    });
    const doc = await createDoc(page, basePath, {
      title: `Inherit Default Doc ${Date.now()}`,
      collectionId: collection.id,
    });

    const info = await apiCall(page, basePath, "documents.info", { id: doc.id });
    expect(info.data.inheritPermission).toBe(true);

    await deleteCollection(page, basePath, collection.id);
  });

  test("disabling inheritance grants the actor an admin membership", async () => {
    const collection = await createCollection(page, basePath, {
      name: `E2E Inherit Toggle Coll ${Date.now()}`,
    });
    const doc = await createDoc(page, basePath, {
      title: `Inherit Toggle Doc ${Date.now()}`,
      collectionId: collection.id,
    });

    const updated = await apiCall(page, basePath, "documents.update", {
      id: doc.id,
      inheritPermission: false,
    });
    expect(updated.data.inheritPermission).toBe(false);

    const memberships = await apiCall(page, basePath, "documents.memberships", {
      id: doc.id,
    });
    const mine = memberships.data.memberships.find(
      (m: { userId: string }) => m.userId === adminUserId
    );
    expect(mine).toBeTruthy();
    expect(mine.permission).toBe("admin");

    await deleteCollection(page, basePath, collection.id);
  });

  test.describe("cross-user visibility", () => {
    let viewerContext: BrowserContext;
    let viewerPage: Page;
    let viewerUserId: string;

    test.beforeAll(async ({ browser }) => {
      const auth = await loginViaOIDC(browser, basePath, {
        username: process.env.E2E_VIEWER_USERNAME,
        password: process.env.E2E_VIEWER_PASSWORD,
      });
      viewerContext = auth.context;
      viewerPage = auth.page;

      const viewerInfo = await apiCall(viewerPage, basePath, "users.info", {});
      viewerUserId = viewerInfo.data.id;
    });

    test.afterAll(async () => {
      await viewerContext.close();
    });

    test("viewer loses access when inheritance is disabled, regains with direct membership", async () => {
      const collection = await createCollection(page, basePath, {
        name: `E2E Inherit Cross Coll ${Date.now()}`,
      });
      const doc = await createDoc(page, basePath, {
        title: `Inherit Cross Doc ${Date.now()}`,
        collectionId: collection.id,
      });

      // Viewer has read access to the collection.
      await addUserToCollection(page, basePath, collection.id, viewerUserId, "read");

      // While inheriting, the viewer can read the doc and it appears in the
      // collection structure.
      const infoWhileInheriting = await apiCall(
        viewerPage,
        basePath,
        "documents.info",
        { id: doc.id }
      );
      expect(infoWhileInheriting.data.id).toBe(doc.id);
      expect(infoWhileInheriting.data.inheritPermission).toBe(true);

      const structureRes = await apiCall(
        viewerPage,
        basePath,
        "collections.documents",
        { id: collection.id }
      );
      expect(containsDocId(structureRes.data, doc.id)).toBe(true);

      // Admin disables inheritance; the viewer has no direct membership.
      await apiCall(page, basePath, "documents.update", {
        id: doc.id,
        inheritPermission: false,
      });

      const denied = await apiCallRaw(viewerPage, basePath, "documents.info", {
        id: doc.id,
      });
      expect(denied.status()).toBe(403);

      const structureAfter = await apiCall(
        viewerPage,
        basePath,
        "collections.documents",
        { id: collection.id }
      );
      expect(containsDocId(structureAfter.data, doc.id)).toBe(false);

      // A direct document membership restores access despite inheritance off.
      await addUserToDocument(page, basePath, doc.id, viewerUserId, "read");

      const regained = await apiCall(viewerPage, basePath, "documents.info", {
        id: doc.id,
      });
      expect(regained.data.id).toBe(doc.id);

      await deleteCollection(page, basePath, collection.id);
    });
  });

  test.describe("UI toggle", () => {
    test("stop inheriting and restore via the share popover", async () => {
      const collection = await createCollection(page, basePath, {
        name: `E2E Inherit UI Coll ${Date.now()}`,
      });
      const doc = await createDoc(page, basePath, {
        title: `Inherit UI Doc ${Date.now()}`,
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

      // Open the Share popover from the document header. The popover's content
      // is lazily loaded and its share data is only fetched on hover
      // (onMouseEnter). A click without the preceding hover is swallowed by the
      // resulting re-render — verified empirically, the popover never opened,
      // so `data-state="open"` is not a reliable gate. Instead wait for the
      // hover-triggered preload (documents.memberships and
      // documents.group_memberships always fire) so the click lands on a
      // settled button.
      const shareButton = page.locator(`button:has-text("Share")`).first();
      const preloadResponses = Promise.all([
        page.waitForResponse(
          (res) =>
            res.request().method() === "POST" &&
            res.url().includes("/api/documents.memberships"),
          { timeout: 15000 }
        ),
        page.waitForResponse(
          (res) =>
            res.request().method() === "POST" &&
            res.url().includes("/api/documents.group_memberships"),
          { timeout: 15000 }
        ),
      ]);
      await shareButton.hover();
      await preloadResponses;
      await shareButton.click();
      await expect(
        page.locator("text=Stop inheriting").first()
      ).toBeVisible({ timeout: 10000 });

      // Stop inheriting — assert the frontend sends inheritPermission: false.
      // Match only update requests that carry an inheritPermission change so a
      // spurious documents.update cannot resolve the wait.
      const stopPromise = waitForApiRequest(
        page,
        "POST",
        (req) =>
          req.url().includes("/api/documents.update") &&
          req.postDataJSON()?.inheritPermission !== undefined
      );
      await page.locator("text=Stop inheriting").first().click();
      const stopReq = await stopPromise;
      expect(stopReq.postDataJSON()).toMatchObject({ inheritPermission: false });

      await expect(
        page.locator("text=Not inheriting permissions").first()
      ).toBeVisible({ timeout: 10000 });
      await expect(
        page.locator("text=Restore inheritance").first()
      ).toBeVisible();

      // Restore inheritance — assert inheritPermission: true. Same predicate
      // as above so only update requests carrying an inheritPermission change
      // resolve the wait.
      const restorePromise = waitForApiRequest(
        page,
        "POST",
        (req) =>
          req.url().includes("/api/documents.update") &&
          req.postDataJSON()?.inheritPermission !== undefined
      );
      await page.locator("text=Restore inheritance").first().click();
      const restoreReq = await restorePromise;
      expect(restoreReq.postDataJSON()).toMatchObject({ inheritPermission: true });

      await deleteCollection(page, basePath, collection.id);
    });
  });
});
