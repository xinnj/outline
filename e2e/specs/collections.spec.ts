import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { loginViaOIDC } from "../helpers/auth";
import {
  createCollection,
  createDoc,
  updateCollection,
  archiveCollection,
  restoreCollection,
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
let basePath: string;

test.describe("Collections", () => {
  test.beforeAll(async ({ browser }) => {
    basePath = resolveBasePath();
    const auth = await loginViaOIDC(browser, basePath);
    context = auth.context;
    page = auth.page;
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("should create a collection", async () => {
    const collectionName = `E2E Collection ${Date.now()}`;

    // Create a collection via API (UI button text varies by locale)
    const collection = await createCollection(page, basePath, {
      name: collectionName,
    });

    expect(collection.id).toBeTruthy();
    expect(collection.name).toBe(collectionName);

    // Verify the collection is accessible by navigating to it
    await page.goto(`${basePath}${collection.url}`);
    await page.waitForLoadState("networkidle");

    await expect(
      page.locator(`text=${collectionName}`).first()
    ).toBeVisible({ timeout: 10000 });

    // Clean up: delete the created collection via API
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

  test("should delete a collection", async () => {
    // Create a collection via API for setup
    const collection = await createCollection(page, basePath, {
      name: `E2E Delete Collection ${Date.now()}`,
    });

    // Delete the collection via API
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

    const deleteRes = await page.request.post(
      `${basePath}/api/collections.delete`,
      {
        headers: {
          cookie: cookieHeader,
          "x-csrf-token": csrfToken,
          "content-type": "application/json",
        },
        data: { id: collection.id },
      }
    );
    expect(deleteRes.ok()).toBeTruthy();

    // Verify the collection is no longer accessible
    const infoRes = await page.request.post(
      `${basePath}/api/collections.info`,
      {
        headers: {
          cookie: cookieHeader,
          "x-csrf-token": csrfToken,
          "content-type": "application/json",
        },
        data: { id: collection.id },
      }
    );
    expect(infoRes.ok()).toBeFalsy();
  });

  test("should view collection document list", async () => {
    // Create a collection via API
    const collection = await createCollection(page, basePath, {
      name: `E2E Doc List Collection ${Date.now()}`,
    });

    // Create 3 documents in the collection
    const doc1 = await createDoc(page, basePath, {
      title: `Doc Alpha ${Date.now()}`,
      collectionId: collection.id,
    });
    const doc2 = await createDoc(page, basePath, {
      title: `Doc Beta ${Date.now()}`,
      collectionId: collection.id,
    });
    const doc3 = await createDoc(page, basePath, {
      title: `Doc Gamma ${Date.now()}`,
      collectionId: collection.id,
    });

    // Navigate to the collection page
    const listPromise = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/documents.list"),
      { timeout: 15000 }
    );
    await page.goto(`${basePath}${collection.url}`);
    await listPromise;

    // Verify the collection name is visible on the page
    await expect(
      page.locator(`text=${collection.name}`).first()
    ).toBeVisible({ timeout: 10000 });

    // Verify all 3 document titles appear on the page
    for (const doc of [doc1, doc2, doc3]) {
      await expect(
        page.locator(`text=${doc.title}`).first()
      ).toBeVisible({ timeout: 10000 });
    }

    // Cleanup: delete the collection via API
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

  test("should create collections with different permission levels", async () => {
    // Create collections with each permission level via API and verify the
    // response includes the correct permission.

    const readCollection = await createCollection(page, basePath, {
      name: `E2E Read Collection ${Date.now()}`,
      permission: "read",
    });
    expect(readCollection.permission).toBe("read");
    expect(readCollection.name).toContain("E2E Read Collection");

    const readWriteCollection = await createCollection(page, basePath, {
      name: `E2E ReadWrite Collection ${Date.now()}`,
      permission: "read_write",
    });
    expect(readWriteCollection.permission).toBe("read_write");
    expect(readWriteCollection.name).toContain("E2E ReadWrite Collection");

    const privateCollection = await createCollection(page, basePath, {
      name: `E2E Private Collection ${Date.now()}`,
      permission: null,
    });
    expect(privateCollection.permission).toBeNull();
    expect(privateCollection.name).toContain("E2E Private Collection");

    // Verify permissions via collections.info endpoint
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

    for (const col of [readCollection, readWriteCollection, privateCollection]) {
      const infoRes = await page.request.post(
        `${basePath}/api/collections.info`,
        {
          headers: {
            cookie: cookieHeader,
            "x-csrf-token": csrfToken,
            "content-type": "application/json",
          },
          data: { id: col.id },
        }
      );
      expect(infoRes.ok()).toBeTruthy();
      const info = await infoRes.json();
      expect(info.data.permission).toBe(col.permission);

      // Cleanup
      await page.request.post(`${basePath}/api/collections.delete`, {
        headers: {
          cookie: cookieHeader,
          "x-csrf-token": csrfToken,
          "content-type": "application/json",
        },
        data: { id: col.id },
      });
    }
  });

  test("should manage collection members", async () => {
    // Create a collection via API
    const collection = await createCollection(page, basePath, {
      name: `E2E Member Collection ${Date.now()}`,
      permission: null,
    });

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

    // Create a group for testing member management
    const groupRes = await page.request.post(`${basePath}/api/groups.create`, {
      headers: {
        cookie: cookieHeader,
        "x-csrf-token": csrfToken,
        "content-type": "application/json",
      },
      data: { name: `E2E Group ${Date.now()}` },
    });
    expect(groupRes.ok()).toBeTruthy();
    const group = (await groupRes.json()).data;

    // Add group to collection with read permission
    const addRes = await page.request.post(
      `${basePath}/api/collections.add_group`,
      {
        headers: {
          cookie: cookieHeader,
          "x-csrf-token": csrfToken,
          "content-type": "application/json",
        },
        data: { id: collection.id, groupId: group.id, permission: "read" },
      }
    );
    expect(addRes.ok()).toBeTruthy();

    // Verify group membership
    const membershipsRes = await page.request.post(
      `${basePath}/api/collections.group_memberships`,
      {
        headers: {
          cookie: cookieHeader,
          "x-csrf-token": csrfToken,
          "content-type": "application/json",
        },
        data: { id: collection.id },
      }
    );
    expect(membershipsRes.ok()).toBeTruthy();
    const memberships = (await membershipsRes.json()).data;
    const found = memberships.groups.some(
      (g: { id: string }) => g.id === group.id
    );
    expect(found).toBeTruthy();

    // Remove group from collection
    const removeRes = await page.request.post(
      `${basePath}/api/collections.remove_group`,
      {
        headers: {
          cookie: cookieHeader,
          "x-csrf-token": csrfToken,
          "content-type": "application/json",
        },
        data: { id: collection.id, groupId: group.id },
      }
    );
    expect(removeRes.ok()).toBeTruthy();

    // Cleanup
    await page.request.post(`${basePath}/api/groups.delete`, {
      headers: {
        cookie: cookieHeader,
        "x-csrf-token": csrfToken,
        "content-type": "application/json",
      },
      data: { id: group.id },
    });
    await page.request.post(`${basePath}/api/collections.delete`, {
      headers: {
        cookie: cookieHeader,
        "x-csrf-token": csrfToken,
        "content-type": "application/json",
      },
      data: { id: collection.id },
    });
  });

  test("should edit collection name and description", async () => {
    // Create a collection via API
    const collection = await createCollection(page, basePath, {
      name: `Edit Me Collection ${Date.now()}`,
      description: "Original description.",
    });

    const newName = `Edited Collection ${Date.now()}`;
    const newDescription = "Updated description from e2e test.";

    // Update the collection via API
    const updated = await updateCollection(page, basePath, collection.id, {
      name: newName,
      description: newDescription,
    });
    expect(updated.name).toBe(newName);
    expect(updated.description).toBe(newDescription);

    // Navigate to the collection page and verify the updated name is visible
    const infoPromise = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/collections.info"),
      { timeout: 15000 }
    );
    await page.goto(`${basePath}${collection.url}`);
    await infoPromise;

    await expect(
      page.locator(`text=${newName}`).first()
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

  test("should archive and unarchive a collection", async () => {
    // Create a collection via API
    const collection = await createCollection(page, basePath, {
      name: `Archive Coll ${Date.now()}`,
    });

    // Archive via API
    const archived = await archiveCollection(page, basePath, collection.id);
    expect(archived.archivedAt).toBeTruthy();

    // Restore (unarchive) via API
    const restored = await restoreCollection(page, basePath, collection.id);
    expect(restored.archivedAt).toBeNull();

    // Verify the collection is accessible again
    const infoPromise = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/collections.info"),
      { timeout: 15000 }
    );
    await page.goto(`${basePath}${collection.url}`);
    await infoPromise;

    await expect(
      page.locator(`text=${collection.name}`).first()
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

  test("should add and remove collection members (groups)", async () => {
    // Create a collection and a group via API
    const collection = await createCollection(page, basePath, {
      name: `Group Coll ${Date.now()}`,
    });

    // Create a group
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

    const groupRes = await page.request.post(
      `${basePath}/api/groups.create`,
      {
        headers: {
          cookie: cookieHeader,
          "x-csrf-token": csrfToken,
          "content-type": "application/json",
        },
        data: { name: `E2E Group ${Date.now()}` },
      }
    );
    expect(groupRes.ok()).toBeTruthy();
    const group = (await groupRes.json()).data;

    // Add group to collection with read permission
    const addRes = await page.request.post(
      `${basePath}/api/collections.add_group`,
      {
        headers: {
          cookie: cookieHeader,
          "x-csrf-token": csrfToken,
          "content-type": "application/json",
        },
        data: { id: collection.id, groupId: group.id, permission: "read" },
      }
    );
    expect(addRes.ok()).toBeTruthy();

    // Verify group membership via API
    const membershipsRes = await page.request.post(
      `${basePath}/api/collections.group_memberships`,
      {
        headers: {
          cookie: cookieHeader,
          "x-csrf-token": csrfToken,
          "content-type": "application/json",
        },
        data: { id: collection.id },
      }
    );
    expect(membershipsRes.ok()).toBeTruthy();
    const memberships = (await membershipsRes.json()).data;
    const found = memberships.groups.some(
      (g: { id: string }) => g.id === group.id
    );
    expect(found).toBeTruthy();

    // Remove group from collection
    const removeRes = await page.request.post(
      `${basePath}/api/collections.remove_group`,
      {
        headers: {
          cookie: cookieHeader,
          "x-csrf-token": csrfToken,
          "content-type": "application/json",
        },
        data: { id: collection.id, groupId: group.id },
      }
    );
    expect(removeRes.ok()).toBeTruthy();

    // Cleanup
    await page.request.post(`${basePath}/api/groups.delete`, {
      headers: {
        cookie: cookieHeader,
        "x-csrf-token": csrfToken,
        "content-type": "application/json",
      },
      data: { id: group.id },
    });
    await page.request.post(`${basePath}/api/collections.delete`, {
      headers: {
        cookie: cookieHeader,
        "x-csrf-token": csrfToken,
        "content-type": "application/json",
      },
      data: { id: collection.id },
    });
  });

  test("should export a collection", async () => {
    // Create a collection with a document via API
    const collection = await createCollection(page, basePath, {
      name: `Export Coll ${Date.now()}`,
    });
    await createDoc(page, basePath, {
      title: `Export Doc ${Date.now()}`,
      collectionId: collection.id,
    });

    // Export the collection via API
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
      `${basePath}/api/collections.export`,
      {
        headers: {
          cookie: cookieHeader,
          "x-csrf-token": csrfToken,
          "content-type": "application/json",
          accept: "text/markdown",
        },
        data: { id: collection.id },
      }
    );
    expect(exportRes.ok()).toBeTruthy();

    // The response should contain file operation tracking info
    const exportData = await exportRes.json();
    expect(exportData.data).toBeTruthy();

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
