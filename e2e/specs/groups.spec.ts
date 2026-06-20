import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { loginViaOIDC } from "../helpers/auth";
import {
  createGroup,
  deleteGroup,
  updateGroup,
  addUserToGroup,
  removeUserFromGroup,
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

test.describe("Groups", () => {
  test.beforeAll(async ({ browser }) => {
    basePath = resolveBasePath();
    const auth = await loginViaOIDC(browser, basePath);
    context = auth.context;
    page = auth.page;
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("should create a group", async () => {
    const groupName = `E2E Group ${Date.now()}`;
    const group = await createGroup(page, basePath, groupName);

    expect(group.id).toBeTruthy();
    expect(group.name).toBe(groupName);

    // Verify via groups.list
    const listResult = await apiCall(page, basePath, "groups.list", {});
    expect(Array.isArray(listResult.data.groups)).toBeTruthy();
    const found = listResult.data.groups.some(
      (g: { id: string }) => g.id === group.id
    );
    expect(found).toBeTruthy();

    // Cleanup
    await deleteGroup(page, basePath, group.id);
  });

  test("should edit a group name", async () => {
    const group = await createGroup(
      page,
      basePath,
      `Edit Me Group ${Date.now()}`
    );

    const newName = `Renamed Group ${Date.now()}`;
    const updated = await updateGroup(page, basePath, group.id, newName);
    expect(updated.name).toBe(newName);

    // Cleanup
    await deleteGroup(page, basePath, group.id);
  });

  test("should delete a group", async () => {
    const group = await createGroup(
      page,
      basePath,
      `Delete Me Group ${Date.now()}`
    );

    await deleteGroup(page, basePath, group.id);

    // Verify group is no longer listed
    const listResult = await apiCall(page, basePath, "groups.list", {});
    const found = listResult.data.groups.some(
      (g: { id: string }) => g.id === group.id
    );
    expect(found).toBeFalsy();
  });

  test("should add members to a group", async () => {
    const group = await createGroup(
      page,
      basePath,
      `Member Group ${Date.now()}`
    );

    // Get the current user's ID
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

    const usersRes = await page.request.post(
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
    const users = (await usersRes.json()).data;
    const adminUser = users[0];
    expect(adminUser).toBeTruthy();

    // Add the admin user to the group
    const addResult = await addUserToGroup(
      page,
      basePath,
      group.id,
      adminUser.id
    );
    expect(addResult).toBeTruthy();

    // Verify via groups.memberships
    const membershipsRes = await page.request.post(
      `${basePath}/api/groups.memberships`,
      {
        headers: {
          cookie: cookieHeader,
          "x-csrf-token": csrfToken,
          "content-type": "application/json",
        },
        data: { id: group.id },
      }
    );
    expect(membershipsRes.ok()).toBeTruthy();
    const memberships = (await membershipsRes.json()).data;
    const found = memberships.users.some(
      (u: { id: string }) => u.id === adminUser.id
    );
    expect(found).toBeTruthy();

    // Cleanup
    await deleteGroup(page, basePath, group.id);
  });

  test("should remove members from a group", async () => {
    const group = await createGroup(
      page,
      basePath,
      `Remove Member Group ${Date.now()}`
    );

    // Get the current user's ID and add them to the group
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

    const usersRes = await page.request.post(
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
    const users = (await usersRes.json()).data;
    const adminUser = users[0];

    await addUserToGroup(page, basePath, group.id, adminUser.id);

    // Remove the user from the group
    await removeUserFromGroup(page, basePath, group.id, adminUser.id);

    // Verify the user is no longer a member
    const membershipsRes = await page.request.post(
      `${basePath}/api/groups.memberships`,
      {
        headers: {
          cookie: cookieHeader,
          "x-csrf-token": csrfToken,
          "content-type": "application/json",
        },
        data: { id: group.id },
      }
    );
    const memberships = (await membershipsRes.json()).data;
    const found = memberships.users.some(
      (u: { id: string }) => u.id === adminUser.id
    );
    expect(found).toBeFalsy();

    // Cleanup
    await deleteGroup(page, basePath, group.id);
  });
});
