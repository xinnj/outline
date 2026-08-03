import type { Page } from "@playwright/test";
import { getCsrfToken } from "./auth";

/**
 * Makes an authenticated API call to the Outline server using the page's
 * cookie-based session. Automatically includes the CSRF token.
 */
export async function apiCall(
  page: Page,
  basePath: string,
  action: string,
  body: Record<string, unknown> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const csrfToken = await getCsrfToken(page);

  // page.request is a separate HTTP client — it does not share browser
  // cookies. Both the auth and CSRF cookies must be sent explicitly.
  const cookies = await page.context().cookies();
  const accessToken = cookies.find((c) => c.name === "accessToken")?.value;
  const cookieHeader = [
    `csrfToken=${csrfToken}`,
    accessToken ? `accessToken=${accessToken}` : "",
  ]
    .filter(Boolean)
    .join("; ");

  const response = await page.request.post(
    `${basePath}/api/${action}`,
    {
      headers: {
        cookie: cookieHeader,
        "x-csrf-token": csrfToken,
        "content-type": "application/json",
      },
      data: body,
    }
  );

  if (!response.ok()) {
    const text = await response.text();
    throw new Error(
      `API call ${action} failed with ${response.status()}: ${text}`
    );
  }

  return response.json();
}

/**
 * Creates a document via the API. Returns the created document's data.
 */
export async function createDoc(
  page: Page,
  basePath: string,
  options: {
    title?: string;
    text?: string;
    collectionId: string;
    publish?: boolean;
    parentDocumentId?: string;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const result = await apiCall(page, basePath, "documents.create", {
    title: options.title ?? `E2E Test Doc ${Date.now()}`,
    text: options.text ?? "E2E test content.",
    collectionId: options.collectionId,
    publish: options.publish ?? true,
    parentDocumentId: options.parentDocumentId,
  });
  return result.data;
}

/**
 * Creates a collection via the API.
 */
export async function createCollection(
  page: Page,
  basePath: string,
  options: {
    name?: string;
    description?: string;
    permission?: string | null;
  } = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const body: Record<string, unknown> = {
    name: options.name ?? `E2E Test Collection ${Date.now()}`,
    description: options.description ?? "Created by e2e tests",
  };
  if (options.permission !== undefined) {
    body.permission = options.permission;
  }
  const result = await apiCall(page, basePath, "collections.create", body);
  return result.data;
}

/**
 * Deletes a document by ID (permanent delete).
 */
export async function deleteDoc(
  page: Page,
  basePath: string,
  documentId: string
): Promise<void> {
  await apiCall(page, basePath, "documents.delete", {
    id: documentId,
  });
}

/**
 * Creates a share link for a document or collection.
 */
export async function createShare(
  page: Page,
  basePath: string,
  options: {
    documentId?: string;
    collectionId?: string;
    published?: boolean;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const body: Record<string, unknown> = {};
  if (options.documentId) {
    body.documentId = options.documentId;
  }
  if (options.collectionId) {
    body.collectionId = options.collectionId;
  }
  if (options.published !== undefined) {
    body.published = options.published;
  }
  const result = await apiCall(page, basePath, "shares.create", body);
  return result.data;
}

/**
 * Revokes a share link by ID.
 */
export async function revokeShare(
  page: Page,
  basePath: string,
  shareId: string
): Promise<void> {
  await apiCall(page, basePath, "shares.revoke", { id: shareId });
}

/**
 * Duplicates a document by ID. Returns the duplicated document's data.
 */
export async function duplicateDoc(
  page: Page,
  basePath: string,
  documentId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const result = await apiCall(page, basePath, "documents.duplicate", {
    id: documentId,
  });
  // documents.duplicate returns { data: { documents: [...] } }
  return result.data.documents[0];
}

/**
 * Moves a document to a different collection.
 */
export async function moveDoc(
  page: Page,
  basePath: string,
  documentId: string,
  collectionId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const result = await apiCall(page, basePath, "documents.move", {
    id: documentId,
    collectionId,
  });
  // documents.move returns { data: { documents: [...], collections: [] } }
  return result.data.documents[0];
}

/**
 * Archives a document by ID.
 */
export async function archiveDoc(
  page: Page,
  basePath: string,
  documentId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const result = await apiCall(page, basePath, "documents.archive", {
    id: documentId,
  });
  return result.data;
}

/**
 * Restores a document from trash by ID.
 */
export async function restoreDoc(
  page: Page,
  basePath: string,
  documentId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const result = await apiCall(page, basePath, "documents.restore", {
    id: documentId,
  });
  return result.data;
}

/**
 * Stars a document by ID. Returns the created star data.
 */
export async function starDoc(
  page: Page,
  basePath: string,
  documentId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const result = await apiCall(page, basePath, "stars.create", {
    documentId,
  });
  return result.data;
}

/**
 * Unstars a document by star ID.
 */
export async function unstarDoc(
  page: Page,
  basePath: string,
  starId: string
): Promise<void> {
  await apiCall(page, basePath, "stars.delete", { id: starId });
}

/**
 * Pins a document to a collection (or home if no collectionId).
 * Returns the created pin data.
 */
export async function pinDoc(
  page: Page,
  basePath: string,
  documentId: string,
  collectionId?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const body: Record<string, unknown> = { documentId };
  if (collectionId) {
    body.collectionId = collectionId;
  }
  const result = await apiCall(page, basePath, "pins.create", body);
  return result.data;
}

/**
 * Unpins a document by pin ID.
 */
export async function unpinDoc(
  page: Page,
  basePath: string,
  pinId: string
): Promise<void> {
  await apiCall(page, basePath, "pins.delete", { id: pinId });
}

/**
 * Creates a comment on a document. Returns the created comment data.
 */
export async function createComment(
  page: Page,
  basePath: string,
  documentId: string,
  text: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const result = await apiCall(page, basePath, "comments.create", {
    documentId,
    text,
  });
  return result.data;
}

/**
 * Deletes a comment by ID.
 */
export async function deleteComment(
  page: Page,
  basePath: string,
  commentId: string
): Promise<void> {
  await apiCall(page, basePath, "comments.delete", { id: commentId });
}

/**
 * Resolves a comment by ID.
 */
export async function resolveComment(
  page: Page,
  basePath: string,
  commentId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const result = await apiCall(page, basePath, "comments.resolve", {
    id: commentId,
  });
  return result.data;
}

/**
 * Unresolves a comment by ID.
 */
export async function unresolveComment(
  page: Page,
  basePath: string,
  commentId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const result = await apiCall(page, basePath, "comments.unresolve", {
    id: commentId,
  });
  return result.data;
}

/**
 * Updates a comment's content by ID. Requires ProseMirror JSON data.
 */
export async function updateComment(
  page: Page,
  basePath: string,
  commentId: string,
  data: Record<string, unknown>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const result = await apiCall(page, basePath, "comments.update", {
    id: commentId,
    data,
  });
  return result.data;
}

/**
 * Creates a group. Returns the created group data.
 */
export async function createGroup(
  page: Page,
  basePath: string,
  name: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const result = await apiCall(page, basePath, "groups.create", { name });
  return result.data;
}

/**
 * Deletes a group by ID.
 */
export async function deleteGroup(
  page: Page,
  basePath: string,
  groupId: string
): Promise<void> {
  await apiCall(page, basePath, "groups.delete", { id: groupId });
}

/**
 * Updates a group name by ID.
 */
export async function updateGroup(
  page: Page,
  basePath: string,
  groupId: string,
  name: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const result = await apiCall(page, basePath, "groups.update", {
    id: groupId,
    name,
  });
  return result.data;
}

/**
 * Adds a user to a group.
 */
export async function addUserToGroup(
  page: Page,
  basePath: string,
  groupId: string,
  userId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const result = await apiCall(page, basePath, "groups.add_user", {
    id: groupId,
    userId,
  });
  return result.data;
}

/**
 * Removes a user from a group.
 */
export async function removeUserFromGroup(
  page: Page,
  basePath: string,
  groupId: string,
  userId: string
): Promise<void> {
  await apiCall(page, basePath, "groups.remove_user", {
    id: groupId,
    userId,
  });
}

/**
 * Creates a template. Returns the created template data.
 */
export async function createTemplate(
  page: Page,
  basePath: string,
  options: {
    title: string;
    text?: string;
    collectionId: string;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const text = options.text ?? "E2E template content.";
  // templates.create requires ProseMirror JSON for the `data` field.
  const pmData = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
  const result = await apiCall(page, basePath, "templates.create", {
    title: options.title,
    data: pmData,
    collectionId: options.collectionId,
  });
  return result.data;
}

/**
 * Deletes a template by ID.
 */
export async function deleteTemplate(
  page: Page,
  basePath: string,
  templateId: string
): Promise<void> {
  await apiCall(page, basePath, "templates.delete", { id: templateId });
}

/**
 * Creates an API key. Returns the created API key data (includes the secret).
 */
export async function createApiKey(
  page: Page,
  basePath: string,
  name: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const result = await apiCall(page, basePath, "apiKeys.create", { name });
  return result.data;
}

/**
 * Deletes an API key by ID.
 */
export async function deleteApiKey(
  page: Page,
  basePath: string,
  apiKeyId: string
): Promise<void> {
  await apiCall(page, basePath, "apiKeys.delete", { id: apiKeyId });
}

/**
 * Lists API keys.
 */
export async function listApiKeys(
  page: Page,
  basePath: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>[]> {
  const result = await apiCall(page, basePath, "apiKeys.list", {});
  return result.data;
}

/**
 * Updates a share link's properties.
 */
export async function updateShare(
  page: Page,
  basePath: string,
  shareId: string,
  options: {
    published?: boolean;
    includeChildDocuments?: boolean;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const body: Record<string, unknown> = { id: shareId, ...options };
  const result = await apiCall(page, basePath, "shares.update", body);
  return result.data;
}

/**
 * Archives a collection by ID.
 */
export async function archiveCollection(
  page: Page,
  basePath: string,
  collectionId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const result = await apiCall(page, basePath, "collections.archive", {
    id: collectionId,
  });
  return result.data;
}

/**
 * Restores an archived collection by ID.
 */
export async function restoreCollection(
  page: Page,
  basePath: string,
  collectionId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const result = await apiCall(page, basePath, "collections.restore", {
    id: collectionId,
  });
  return result.data;
}

/**
 * Updates a collection's properties.
 */
export async function updateCollection(
  page: Page,
  basePath: string,
  collectionId: string,
  options: {
    name?: string;
    description?: string;
    permission?: string | null;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const body: Record<string, unknown> = { id: collectionId, ...options };
  const result = await apiCall(page, basePath, "collections.update", body);
  return result.data;
}

/**
 * Updates the authenticated user's profile.
 */
export async function updateProfile(
  page: Page,
  basePath: string,
  options: {
    name?: string;
    avatarUrl?: string;
    language?: string;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const result = await apiCall(page, basePath, "users.update", options);
  return result.data;
}

/**
 * Makes an authenticated API call and returns the raw Response without
 * throwing on non-2xx status codes. Used to assert 400/403 responses.
 */
export async function apiCallRaw(
  page: Page,
  basePath: string,
  action: string,
  body: Record<string, unknown> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const csrfToken = await getCsrfToken(page);
  const cookies = await page.context().cookies();
  const accessToken = cookies.find((c) => c.name === "accessToken")?.value;
  const cookieHeader = [
    `csrfToken=${csrfToken}`,
    accessToken ? `accessToken=${accessToken}` : "",
  ]
    .filter(Boolean)
    .join("; ");

  return page.request.post(`${basePath}/api/${action}`, {
    headers: {
      cookie: cookieHeader,
      "x-csrf-token": csrfToken,
      "content-type": "application/json",
    },
    data: body,
  });
}

/**
 * Adds a user to a collection. Returns the created membership.
 */
export async function addUserToCollection(
  page: Page,
  basePath: string,
  collectionId: string,
  userId: string,
  permission = "read"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const result = await apiCall(page, basePath, "collections.add_user", {
    id: collectionId,
    userId,
    permission,
  });
  return result.data;
}

/**
 * Removes a user from a collection.
 */
export async function removeUserFromCollection(
  page: Page,
  basePath: string,
  collectionId: string,
  userId: string
): Promise<void> {
  await apiCall(page, basePath, "collections.remove_user", {
    id: collectionId,
    userId,
  });
}

/**
 * Adds a user directly to a document. Returns the created membership.
 */
export async function addUserToDocument(
  page: Page,
  basePath: string,
  documentId: string,
  userId: string,
  permission = "read"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const result = await apiCall(page, basePath, "documents.add_user", {
    id: documentId,
    userId,
    permission,
  });
  return result.data;
}

/**
 * Removes a user from a document.
 */
export async function removeUserFromDocument(
  page: Page,
  basePath: string,
  documentId: string,
  userId: string
): Promise<void> {
  await apiCall(page, basePath, "documents.remove_user", {
    id: documentId,
    userId,
  });
}

/**
 * Finds the team's system-managed "Default" group. The group name is reserved
 * and cannot be renamed, so matching by name is reliable.
 */
export async function findDefaultGroup(
  page: Page,
  basePath: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const result = await apiCall(page, basePath, "groups.list", {});
  const group = result.data.groups.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (g: Record<string, any>) => g.name === "Default"
  );
  if (!group) {
    throw new Error('No "Default" group found for the team');
  }
  return group;
}

/**
 * Returns the list of user IDs in a group.
 */
export async function getGroupMembers(
  page: Page,
  basePath: string,
  groupId: string
): Promise<string[]> {
  const result = await apiCall(page, basePath, "groups.memberships", {
    id: groupId,
  });
  return result.data.users.map((u: { id: string }) => u.id);
}

/**
 * Changes a user's role. Admin only.
 */
export async function updateUserRole(
  page: Page,
  basePath: string,
  userId: string,
  role: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const result = await apiCall(page, basePath, "users.update_role", {
    id: userId,
    role,
  });
  return result.data;
}

/**
 * Deletes a collection by ID.
 */
export async function deleteCollection(
  page: Page,
  basePath: string,
  collectionId: string
): Promise<void> {
  await apiCall(page, basePath, "collections.delete", { id: collectionId });
}
