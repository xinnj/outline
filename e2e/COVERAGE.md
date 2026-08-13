# E2E Coverage Status

> **Summary:** 91 covered · 1 partial · 18 not covered (110 total) · 83% covered
>
> **Spec files:** `auth.spec.ts` (5 tests), `collaboration.spec.ts` (2 tests), `collections.spec.ts` (9 tests), `comments.spec.ts` (5 tests), `documents.spec.ts` (15 tests), `groups.spec.ts` (14 tests), `home.spec.ts` (6 tests), `inheritance.spec.ts` (4 tests), `members.spec.ts` (6 tests), `search.spec.ts` (3 tests), `settings.spec.ts` (6 tests), `sharing.spec.ts` (8 tests), `stars.spec.ts` (4 tests), `subpath.spec.ts` (10 tests), `templates.spec.ts` (2 tests)

---

## Authentication & Onboarding

- [x] OIDC login flow — `documents.spec.ts`, `auth.spec.ts` (via `helpers/auth.ts`) — 🔴 high
- [x] CSRF token presence — `subpath.spec.ts` — 🔴 high
- [x] Session cookie path scoping — `subpath.spec.ts` — 🔴 high
- [ ] Invite + accept + register flow — ⚪ manual (needs email/SMTP interception)
- [x] Logout (cookie cleared) — `auth.spec.ts` — 🔴 high
- [x] OIDC logout token cookie scoped to base path — `auth.spec.ts` — 🔴 high
- [ ] Passkey / WebAuthn login — ⚪ manual (needs browser-level WebAuthn emulation)
- [ ] Email magic link login — ⚪ manual (needs email/SMTP interception)
- [ ] Slack OAuth login — ⚪ manual (needs Slack dev app + test workspace)
- [ ] Google OAuth login — ⚪ manual (needs Google Cloud project)
- [ ] Azure AD OAuth login — ⚪ manual (needs Azure tenant)
- [ ] Discord OAuth login — ⚪ manual (needs Discord application)
- [ ] GitHub OAuth login — ⚪ manual (needs GitHub OAuth app)
- [ ] GitLab OAuth login — ⚪ manual (needs GitLab application)

## Documents

- [x] Create document — `documents.spec.ts` — 🔴 high
- [x] Edit document content — `documents.spec.ts` — 🔴 high
- [x] Soft delete to trash — `documents.spec.ts` — 🔴 high
- [x] Restore from trash — `documents.spec.ts` — 🔴 high
- [x] Permanent delete from trash (UI) — `documents.spec.ts` — 🔴 high
- [x] Publish document — `documents.spec.ts` — 🔴 high
- [x] Unpublish document — `documents.spec.ts` — 🔴 high
- [x] Collaborative editing (two users via WebSocket) — `collaboration.spec.ts` — 🔴 high
- [x] Duplicate document — `documents.spec.ts` — 🟡 medium
- [x] Move document to another collection — `documents.spec.ts` — 🟡 medium
- [x] Archive document — `documents.spec.ts` — 🟡 medium
- [x] Unarchive document — `documents.spec.ts` — 🟡 medium
- [x] Import document (Markdown, HTML, etc.) — `documents.spec.ts` — 🟡 medium
- [x] View document history / revisions — `documents.spec.ts` — 🟡 medium
- [x] Restore a specific revision — `documents.spec.ts` — 🟡 medium
- [x] Compare two revisions — `documents.spec.ts` — 🟢 low

## Collections

- [x] Create collection via UI — `collections.spec.ts` — 🔴 high
- [x] Delete collection via UI — `collections.spec.ts` — 🔴 high
- [x] View collection document list — `collections.spec.ts` — 🔴 high
- [x] Collection permissions (read/write/admin) — `collections.spec.ts` — 🔴 high
- [x] Add/remove collection members (users) — `collections.spec.ts` — 🔴 high
- [x] Edit collection name, description, icon — `collections.spec.ts` — 🟡 medium
- [ ] Move documents within/between collections — ⚪ manual (drag-and-drop reordering, fragile to test)
- [x] Add/remove collection members (groups) — `collections.spec.ts` — 🟡 medium
- [x] Archive / unarchive collection — `collections.spec.ts` — 🟡 medium
- [x] Export collection — `collections.spec.ts` — 🟢 low

## Comments

- [x] Add comment on a document — `comments.spec.ts` — 🟡 medium
- [x] Edit comment — `comments.spec.ts` — 🟡 medium
- [x] Delete comment — `comments.spec.ts` — 🟡 medium
- [x] Resolve / reopen comment thread — `comments.spec.ts` — 🟡 medium
- [x] Inline text annotation — `comments.spec.ts` — 🟢 low

## Sharing & Public Access

- [x] Create share link for document — `sharing.spec.ts` — 🔴 high
- [x] Create share link for collection — `sharing.spec.ts` — 🔴 high
- [x] View shared document as anonymous user — `sharing.spec.ts` — 🔴 high
- [x] View shared collection as anonymous user — `sharing.spec.ts` — 🔴 high
- [x] Revoke share link — `sharing.spec.ts` — 🔴 high
- [x] Update share link permissions/expiry — `sharing.spec.ts` — 🟡 medium
- [x] Subscribe to document updates — `sharing.spec.ts` — 🟢 low
- [x] Public sitemap (`/sitemap.xml`) — `sharing.spec.ts` — 🟢 low

## Stars & Pins

- [x] Star a document — `stars.spec.ts` — 🟡 medium
- [x] Unstar a document — `stars.spec.ts` — 🟡 medium
- [x] Pin document to collection — `stars.spec.ts` — 🟡 medium
- [x] Unpin document — `stars.spec.ts` — 🟡 medium

## Home & Navigation

- [x] Trash — view deleted documents — `documents.spec.ts` ⚠️ partial — 🔴 high
- [x] Home page (pinned, recent, starred sections) — `home.spec.ts` — 🔴 high
- [x] Sidebar — collections list and navigation — `home.spec.ts` — 🔴 high
- [x] Breadcrumbs navigation in collection/document — `home.spec.ts` — 🟡 medium
- [x] Drafts list — `home.spec.ts` — 🟢 low
- [x] Archive list — `home.spec.ts` — 🟢 low
- [x] Keyboard shortcuts modal — `home.spec.ts` — 🟢 low

## Search

- [x] Search documents (global) — `search.spec.ts` — 🔴 high
- [x] Search within a collection — `search.spec.ts` — 🔴 high
- [x] Search results pagination — `search.spec.ts` — 🟡 medium

## User Management

- [x] Members list (Settings → Members) — `members.spec.ts` — 🔴 high
- [x] Change user role (Admin ↔ Member ↔ Viewer) — `members.spec.ts` — 🔴 high
- [x] Suspend user — `members.spec.ts` — 🔴 high
- [x] Activate suspended user — `members.spec.ts` — 🔴 high
- [x] Remove user from workspace — `members.spec.ts` — 🔴 high
- [x] Filter / search members — `members.spec.ts` — 🟡 medium

## Groups

- [x] Create group — `groups.spec.ts` — 🟡 medium
- [x] Edit group name — `groups.spec.ts` — 🟡 medium
- [x] Delete group — `groups.spec.ts` — 🟡 medium
- [x] Add members to group — `groups.spec.ts` — 🟡 medium
- [x] Remove members from group — `groups.spec.ts` — 🟡 medium
- [x] Default group protections (no rename/delete/manual membership) — `groups.spec.ts` — 🔴 high
- [x] Default group membership syncs on role change — `groups.spec.ts` — 🔴 high

## Document access inheritance

- [x] Documents inherit permissions from the collection by default — `inheritance.spec.ts` — 🔴 high
- [x] Disabling inheritance restricts access to direct members — `inheritance.spec.ts` — 🔴 high
- [x] UI toggle to stop/restore inheritance — `inheritance.spec.ts` — 🟡 medium

## Team Settings

- [x] Workspace details (name, domain, branding) — `settings.spec.ts` — 🔴 high
- [x] Security settings — `settings.spec.ts` — 🔴 high
- [x] Profile settings — `settings.spec.ts` — 🟡 medium
- [x] API tokens — create / list / revoke — `settings.spec.ts` — 🟡 medium
- [ ] Authentication provider settings — ⚪ manual (needs actual OIDC/SAML backend provisioning)
- [x] Notification preferences — `settings.spec.ts` — 🟢 low
- [x] Data export — `settings.spec.ts` — 🟢 low
- [ ] Data import — ⚪ manual (requires admin role + ZIP file upload)
- [ ] Custom emojis — ⚪ manual (requires SVG/GIF attachment upload first)

## Templates

- [x] Create document from template — `templates.spec.ts` — 🟡 medium
- [x] Manage templates (create / edit / delete) — `templates.spec.ts` — 🟡 medium

## Integrations

- [ ] Slack integration setup — ⚪ manual (needs Slack workspace + app)
- [ ] OAuth application — register / edit / delete — ⚪ manual (needs external OAuth provider)
- [ ] Webhook management — ⚪ manual (needs external webhook receiver)
- [ ] Embed provider configuration — ⚪ manual (needs third-party embed service keys)

## Multi-tenancy (Sub-path)

- [x] App shell served at sub-path — `subpath.spec.ts` — 🔴 high
- [x] Cookies scoped to sub-path — `subpath.spec.ts` — 🔴 high
- [x] API routes scoped under sub-path — `subpath.spec.ts` — 🔴 high
- [x] Static assets served under sub-path — `subpath.spec.ts` — 🔴 high
- [x] OIDC discovery endpoints scoped — `subpath.spec.ts` — 🔴 high
- [x] CSP does not leak sub-path — `subpath.spec.ts` — 🔴 high
- [x] OpenSearch descriptor under sub-path — `subpath.spec.ts` — 🔴 high
- [x] Service worker registered at sub-path — `subpath.spec.ts` — 🔴 high
- [ ] Custom domain routing — ⚪ manual (domain field not settable via public API)

## Infrastructure

- [x] API call carries base path in URL — `documents.spec.ts` — 🔴 high
- [x] API call payload validation (title, params) — `documents.spec.ts` — 🔴 high
- [x] Network request interception pattern — `helpers/network.ts` — 🔴 high

---

## Priority Legend

| Level | Label | What it means for this fork |
|-------|-------|------|
| 🔴 | **High** | Blocks daily use for a small/medium team: OIDC auth, document CRUD, collections, sharing, search, sub-path routing, trash/restore, member management. Test these first. |
| 🟡 | **Medium** | Important but not blocking: revisions, pins/stars, groups, templates, sidebar nav, settings, comments. Build on high-priority coverage. |
| 🟢 | **Low** | Rarely used or third-party: non-OIDC OAuth providers, custom domain, integrations, drafts, archive, emoji, import/export. Test when the above is solid. |
| ⚪ | **Manual** | Cannot be fully automated — requires email/SMTP interception, out-of-band token capture, or manual UI steps. |

## Available Helpers

These helpers are ready for use in new spec files:

| Helper | File | Purpose |
|--------|------|---------|
| `loginViaOIDC` | `helpers/auth.ts` | Full OIDC login → authenticated context + page |
| `createAnonymousContext` | `helpers/auth.ts` | Fresh browser context with no cookies |
| `getCsrfToken` | `helpers/auth.ts` | Extract CSRF token from cookies |
| `apiCall` | `helpers/api.ts` | Generic authenticated API call helper |
| `createDoc` | `helpers/api.ts` | API: `documents.create` |
| `createCollection` | `helpers/api.ts` | API: `collections.create` |
| `deleteDoc` | `helpers/api.ts` | API: `documents.delete` |
| `duplicateDoc` | `helpers/api.ts` | API: `documents.duplicate` |
| `moveDoc` | `helpers/api.ts` | API: `documents.move` |
| `archiveDoc` | `helpers/api.ts` | API: `documents.archive` |
| `restoreDoc` | `helpers/api.ts` | API: `documents.restore` |
| `createShare` | `helpers/api.ts` | API: `shares.create` |
| `revokeShare` | `helpers/api.ts` | API: `shares.revoke` |
| `updateShare` | `helpers/api.ts` | API: `shares.update` |
| `starDoc` | `helpers/api.ts` | API: `stars.create` |
| `unstarDoc` | `helpers/api.ts` | API: `stars.delete` |
| `pinDoc` | `helpers/api.ts` | API: `pins.create` |
| `unpinDoc` | `helpers/api.ts` | API: `pins.delete` |
| `createComment` | `helpers/api.ts` | API: `comments.create` |
| `updateComment` | `helpers/api.ts` | API: `comments.update` |
| `deleteComment` | `helpers/api.ts` | API: `comments.delete` |
| `resolveComment` | `helpers/api.ts` | API: `comments.resolve` |
| `unresolveComment` | `helpers/api.ts` | API: `comments.unresolve` |
| `createGroup` | `helpers/api.ts` | API: `groups.create` |
| `updateGroup` | `helpers/api.ts` | API: `groups.update` |
| `deleteGroup` | `helpers/api.ts` | API: `groups.delete` |
| `addUserToGroup` | `helpers/api.ts` | API: `groups.add_user` |
| `removeUserFromGroup` | `helpers/api.ts` | API: `groups.remove_user` |
| `apiCallRaw` | `helpers/api.ts` | API: returns raw Response (non-2xx assertions) |
| `addUserToCollection` | `helpers/api.ts` | API: `collections.add_user` |
| `removeUserFromCollection` | `helpers/api.ts` | API: `collections.remove_user` |
| `addUserToDocument` | `helpers/api.ts` | API: `documents.add_user` |
| `removeUserFromDocument` | `helpers/api.ts` | API: `documents.remove_user` |
| `findDefaultGroup` | `helpers/api.ts` | API: `groups.list` (name = "Default") |
| `getGroupMembers` | `helpers/api.ts` | API: `groups.memberships` |
| `updateUserRole` | `helpers/api.ts` | API: `users.update_role` |
| `deleteCollection` | `helpers/api.ts` | API: `collections.delete` |
| `createTemplate` | `helpers/api.ts` | API: `templates.create` |
| `deleteTemplate` | `helpers/api.ts` | API: `templates.delete` |
| `createApiKey` | `helpers/api.ts` | API: `apiKeys.create` |
| `listApiKeys` | `helpers/api.ts` | API: `apiKeys.list` |
| `deleteApiKey` | `helpers/api.ts` | API: `apiKeys.delete` |
| `updateProfile` | `helpers/api.ts` | API: `users.update` |
| `updateCollection` | `helpers/api.ts` | API: `collections.update` |
| `archiveCollection` | `helpers/api.ts` | API: `collections.archive` |
| `restoreCollection` | `helpers/api.ts` | API: `collections.restore` |
| `interceptApiCalls` | `helpers/network.ts` | Route-based API interception with assertions |
| `waitForApiRequest` | `helpers/network.ts` | Wait for a specific API request |
| `waitForApiResponse` | `helpers/network.ts` | Wait for a specific API response |

## Lessons Learned

### `/doc/new` redirect race

Navigating to `/doc/new?collectionId=…` auto-creates a draft via `documents.create`. After the response, Outline **redirects to the collection page** — the editor only appears briefly. Never rely on the editor being visible after catching the `documents.create` request.

**Fix:** wait for the **response** (not the request), extract the document URL from `body.data.url`, then navigate to it explicitly. Same pattern as the publish test.

```typescript
// ✅ Correct: wait for response, extract URL, navigate explicitly
const createResponse = page.waitForResponse(…);
await page.goto(`/doc/new?collectionId=…`);
const response = await createResponse;
const docUrl = (await response.json()).data.url;
await page.goto(docUrl);
```

### `page.request` vs `page.waitForRequest`

API helpers (`createDoc`, `deleteDoc`, etc.) use `page.request.post()` — Playwright's **separate HTTP client** that doesn't share browser cookies and doesn't emit browser-level request events. `page.waitForRequest` / `page.waitForResponse` only catch requests made through the **browser page**, not through `page.request`.

**Result:** you can't intercept a `createDoc()` call with `page.waitForRequest`. Use API helpers for **setup** and browser navigation for the **action under test**.

### Menu button selectors

The account menu (top nav) and document menu (header) both render `button[aria-haspopup='menu']`. The account menu comes first in DOM order, so `.first()` clicks the wrong button.

**Fix:** use `.last()` — the document menu renders inside `<main>`, which is after the top nav bar in DOM order.

```typescript
// ✅ Correct: last button[aria-haspopup] is the document menu
const menuTrigger = page.locator("button[aria-haspopup='menu']").last();
```

### OIDC logout redirect

Navigating to `/logout` triggers a chain: `auth.logout()` → POST `/auth.delete` → redirect to OIDC provider (Keycloak) → redirect back to app → **OIDC auto-reauthenticates** and sets new cookies. Checking cookies after `/logout` always sees the new ones, not cleared ones.

**Fix:** call `/auth.delete` via the API directly and verify the old token is rejected (401).

```typescript
// ✅ Correct: API-based logout test
await page.request.post(`/api/auth.delete`, { headers: { cookie: … } });
const res = await page.request.post(`/api/auth.info`, { headers: { cookie: … } });
expect(res.status()).toBe(401);
```

### Rate limiter on the test server

The test server (`ci.bizconf.cn`) enforces rate limits via `rate-limiter-flexible`. Multiple browser contexts (collaboration tests) or rapid API calls (login + CRUD) quickly hit the 429 limit.

**Fix:** set `RATE_LIMITER_ENABLED=false` on the test server. This single env var disables all HTTP rate limiting — both the global `defaultRateLimiter()` and every per-route `rateLimiter()` middleware check it at the top of their handler.

### Unique document titles

Soft-deleted documents are NOT cleaned up between test runs — they accumulate in trash permanently. Using a fixed title like `"Permanent Delete Test Document"` causes collisions where `not.toBeVisible()` passes because an old document with the same title is still visible.

**Fix:** include `Date.now()` in titles or use the default title from `createDoc()` which already does this.

```typescript
// ✅ Correct: unique title per run
const title = `My Test Doc ${Date.now()}`;
```

### Prefer API setup, assert via UI

The most reliable pattern: use API helpers (`createDoc`, `deleteDoc`, `page.request.post`) to set up test state, then use browser navigation and Playwright assertions to verify the UI reflects the expected state. Reserve UI interactions (clicks, menus, typing) for the specific action being tested — don't use them for setup.

```typescript
// ✅ Pattern: API setup → navigate → assert UI
const doc = await createDoc(page, basePath, { … });     // API setup
await page.goto(`${basePath}${doc.url}`);                 // navigate
await expect(page.locator("text=…")).toBeVisible();       // UI assertion
```

## Conventions

- Check a box (`[x]`) when the feature has at least one meaningful e2e test.
- Append the spec file name and priority after the feature, e.g. `— \`documents.spec.ts\` — 🔴 high`.
- Mark ⚠️ **partial** when coverage exists but major gaps remain — explain the gap in a note.
- Add new feature lines under the appropriate section as the app grows.
- Update the summary line at the top when counts change.
