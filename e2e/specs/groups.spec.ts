import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { loginViaOIDC } from "../helpers/auth";
import {
  createGroup,
  deleteGroup,
  updateGroup,
  addUserToGroup,
  removeUserFromGroup,
  apiCall,
  apiCallRaw,
  findDefaultGroup,
  getGroupMembers,
  updateUserRole,
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

  test.describe("Default group", () => {
    let adminUserId: string;

    test.beforeAll(async () => {
      const listResult = await apiCall(page, basePath, "users.list", {});
      const adminUser = listResult.data.find(
        (u: { role: string }) => u.role === "admin"
      );
      adminUserId = adminUser?.id ?? listResult.data[0].id;
    });

    test("should list a group named Default", async () => {
      const group = await findDefaultGroup(page, basePath);
      expect(group.name).toBe("Default");
    });

    test("should include the admin user", async () => {
      const group = await findDefaultGroup(page, basePath);
      const members = await getGroupMembers(page, basePath, group.id);
      expect(members).toContain(adminUserId);
    });

    test("should not allow renaming", async () => {
      const group = await findDefaultGroup(page, basePath);
      const res = await apiCallRaw(page, basePath, "groups.update", {
        id: group.id,
        name: `Renamed ${Date.now()}`,
      });
      expect(res.status()).toBe(400);
    });

    test("should not allow deletion", async () => {
      const group = await findDefaultGroup(page, basePath);
      const res = await apiCallRaw(page, basePath, "groups.delete", {
        id: group.id,
      });
      expect(res.status()).toBe(403);
    });

    test("should not allow manually adding a member", async () => {
      const group = await findDefaultGroup(page, basePath);
      const res = await apiCallRaw(page, basePath, "groups.add_user", {
        id: group.id,
        userId: adminUserId,
      });
      expect(res.status()).toBe(400);
    });

    test("should not allow manually removing a member", async () => {
      const group = await findDefaultGroup(page, basePath);
      const members = await getGroupMembers(page, basePath, group.id);
      expect(members.length).toBeGreaterThan(0);
      const res = await apiCallRaw(page, basePath, "groups.remove_user", {
        id: group.id,
        userId: members[0],
      });
      expect(res.status()).toBe(400);
    });

    test("should allow updating non-name fields", async () => {
      const group = await findDefaultGroup(page, basePath);
      // Read the current value first so the restore below puts the field back
      // to its prior state instead of assuming it was false.
      const before = await apiCall(page, basePath, "groups.info", {
        id: group.id,
      });
      const result = await apiCall(page, basePath, "groups.update", {
        id: group.id,
        disableMentions: true,
      });
      expect(result.data.id).toBe(group.id);
      // Restore the field so the change does not persist beyond this test.
      await apiCall(page, basePath, "groups.update", {
        id: group.id,
        disableMentions: before.data.disableMentions,
      });
    });
  });

  test.describe("Default group cross-user", () => {
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

      // users.info without an id returns the current user.
      const viewerInfo = await apiCall(viewerPage, basePath, "users.info", {});
      viewerUserId = viewerInfo.data.id;
    });

    test.afterAll(async () => {
      await viewerContext.close();
    });

    test("should include the viewer user", async () => {
      const group = await findDefaultGroup(page, basePath);
      const members = await getGroupMembers(page, basePath, group.id);
      expect(members).toContain(viewerUserId);
    });

    test("should remove the viewer on demotion and re-add on promotion", async () => {
      const group = await findDefaultGroup(page, basePath);
      const isMember = async () =>
        (await getGroupMembers(page, basePath, group.id)).includes(
          viewerUserId
        );

      try {
        // Demote viewer -> guest. The processor runs asynchronously via Bull,
        // so poll groups.memberships until the change lands (up to ~20s).
        await updateUserRole(page, basePath, viewerUserId, "guest");

        for (let attempt = 0; attempt < 20 && (await isMember()); attempt++) {
          await page.waitForTimeout(1000);
        }
        expect(await isMember()).toBe(false);

        // Promote guest -> viewer.
        await updateUserRole(page, basePath, viewerUserId, "viewer");

        for (let attempt = 0; attempt < 20 && !(await isMember()); attempt++) {
          await page.waitForTimeout(1000);
        }
        expect(await isMember()).toBe(true);
      } finally {
        // Restore the viewer to a clean state even if an assertion above
        // failed, so a viewer left behind as a guest does not break the next
        // run's "should include the viewer user" test.
        const info = await apiCall(page, basePath, "users.info", {
          id: viewerUserId,
        });
        if (info.data.role === "guest") {
          await updateUserRole(page, basePath, viewerUserId, "viewer");
        }

        // Membership may lag the promotion due to the async processor, so poll
        // until the viewer is a member again (up to ~10s).
        for (let attempt = 0; attempt < 10 && !(await isMember()); attempt++) {
          await page.waitForTimeout(1000);
        }
      }
    });
  });
});
