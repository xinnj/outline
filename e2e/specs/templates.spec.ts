import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { loginViaOIDC } from "../helpers/auth";
import {
  createCollection,
  createTemplate,
  deleteTemplate,
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

test.describe("Templates", () => {
  test.beforeAll(async ({ browser }) => {
    basePath = resolveBasePath();
    const auth = await loginViaOIDC(browser, basePath);
    context = auth.context;
    page = auth.page;
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("should create a document from a template", async () => {
    // Create a collection and a template
    const collection = await createCollection(page, basePath, {
      name: `E2E Template Coll ${Date.now()}`,
    });

    const template = await createTemplate(page, basePath, {
      title: `E2E Template ${Date.now()}`,
      text: "Template body content for E2E tests.",
      collectionId: collection.id,
    });
    expect(template.id).toBeTruthy();
    expect(template.title).toContain("E2E Template");

    // Verify the template appears in the templates list
    const listResult = await apiCall(page, basePath, "templates.list", {
      collectionId: collection.id,
    });
    expect(Array.isArray(listResult.data)).toBeTruthy();
    const found = listResult.data.some(
      (t: { id: string }) => t.id === template.id
    );
    expect(found).toBeTruthy();

    // Create a document from the template via API
    const docResult = await apiCall(page, basePath, "documents.create", {
      templateId: template.id,
      collectionId: collection.id,
      title: `Doc From Template ${Date.now()}`,
    });
    expect(docResult.data.id).toBeTruthy();
    expect(docResult.data.title).toContain("Doc From Template");

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

  test("should manage templates (create, edit, delete)", async () => {
    // Create a collection
    const collection = await createCollection(page, basePath, {
      name: `E2E Template Mgmt Coll ${Date.now()}`,
    });

    // Create a template
    const template = await createTemplate(page, basePath, {
      title: `Manage Me Template ${Date.now()}`,
      text: "Original template text.",
      collectionId: collection.id,
    });
    expect(template.id).toBeTruthy();

    // Edit the template via API
    const updatedName = `Updated Template ${Date.now()}`;
    const updated = await apiCall(page, basePath, "templates.update", {
      id: template.id,
      title: updatedName,
    });
    expect(updated.data.title).toBe(updatedName);

    // Delete the template
    await deleteTemplate(page, basePath, template.id);

    // Verify template is no longer listed
    const listResult = await apiCall(page, basePath, "templates.list", {
      collectionId: collection.id,
    });
    const found = listResult.data.some(
      (t: { id: string }) => t.id === template.id
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
