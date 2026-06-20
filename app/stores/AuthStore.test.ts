import { vi, beforeEach, describe, it, expect } from "vitest";

// ── Configurable env mock ────────────────────────────────────────────────────
// env is a module singleton — mocking it lets us control BASE_PATH per test.
const mockEnv = vi.hoisted(() => ({
  BASE_PATH: "",
  ENVIRONMENT: "test",
  isDevelopment: false,
  isTest: true,
  isProduction: false,
  OIDC_LOGOUT_URI: undefined as string | undefined,
}));

vi.mock("~/env", () => ({ default: mockEnv }));

// ── Mock tiny-cookie ─────────────────────────────────────────────────────────
const mockSetCookie = vi.hoisted(() => vi.fn());
const mockGetCookie = vi.hoisted(() => vi.fn().mockReturnValue(null));

vi.mock("tiny-cookie", () => ({
  getCookie: mockGetCookie,
  setCookie: mockSetCookie,
}));

// ── Mock Storage (localStorage persistence) ──────────────────────────────────
vi.mock("@shared/utils/Storage", () => ({
  default: {
    get: vi.fn().mockReturnValue({}),
    set: vi.fn(),
  },
}));

// ── Mock secondary dependencies ──────────────────────────────────────────────
vi.mock("~/utils/developer", () => ({
  deleteAllDatabases: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/utils/Desktop", () => ({
  default: { isElectron: () => false },
}));
vi.mock("~/utils/Logger", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("~/utils/isCloudHosted", () => ({
  default: false,
}));
vi.mock("@shared/utils/domains", () => ({
  getCookieDomain: vi.fn().mockReturnValue(undefined),
  parseDomain: vi.fn().mockReturnValue({}),
}));
vi.mock("~/hooks/useLastVisitedPath", () => ({
  setPostLoginPath: vi.fn(),
}));

// ── ApiClient is mocked globally via app/test/setup.ts ──────────────────────
import { client } from "~/utils/ApiClient";
import AuthStore from "./AuthStore";
import type RootStore from "~/stores/RootStore";

function createRootStore() {
  return {
    users: {
      add: vi.fn(),
      get: vi.fn(),
    },
    groups: {
      add: vi.fn(),
    },
    groupUsers: {
      add: vi.fn(),
    },
    policies: {
      get: vi.fn(),
    },
    clear: vi.fn(),
  } as unknown as RootStore;
}

function createAuthStore() {
  return new AuthStore(createRootStore());
}

describe("AuthStore.logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.BASE_PATH = "";
    mockEnv.OIDC_LOGOUT_URI = undefined;
  });

  describe("logoutRedirectUri", () => {
    it("should include basePath when sub-path deployment", async () => {
      mockEnv.BASE_PATH = "/kb";

      const store = createAuthStore();
      store.lastSignedIn = "oidc";

      await store.logout({
        clearCache: true,
        revokeToken: false,
        savePath: false,
        userInitiated: true,
      });

      expect(store.logoutRedirectUri).toBe("/kb/auth/oidc.logout");
    });

    it("should work without basePath for root deployment", async () => {
      const store = createAuthStore();
      store.lastSignedIn = "oidc";

      await store.logout({
        clearCache: true,
        revokeToken: false,
        savePath: false,
        userInitiated: true,
      });

      expect(store.logoutRedirectUri).toBe("/auth/oidc.logout");
    });

    it("should use BASE_PATH when OIDC_LOGOUT_URI is set (even without oidc lastSignedIn)", async () => {
      mockEnv.BASE_PATH = "/outline";
      mockEnv.OIDC_LOGOUT_URI = "https://provider.example.com/logout";

      const store = createAuthStore();
      store.lastSignedIn = null;

      await store.logout({
        clearCache: true,
        revokeToken: false,
        savePath: false,
        userInitiated: true,
      });

      expect(store.logoutRedirectUri).toBe("/outline/auth/oidc.logout");
    });

    it("should not set logoutRedirectUri when userInitiated is false", async () => {
      mockEnv.BASE_PATH = "/kb";
      mockEnv.OIDC_LOGOUT_URI = "https://provider.example.com/logout";

      const store = createAuthStore();
      store.lastSignedIn = "oidc";

      await store.logout({
        clearCache: true,
        revokeToken: false,
        savePath: false,
        userInitiated: false,
      });

      expect(store.logoutRedirectUri).toBeUndefined();
    });

    it("should not set logoutRedirectUri for non-OIDC sign-in", async () => {
      const store = createAuthStore();
      store.lastSignedIn = "google";

      await store.logout({
        clearCache: true,
        revokeToken: false,
        savePath: false,
        userInitiated: true,
      });

      expect(store.logoutRedirectUri).toBeUndefined();
    });
  });

  describe("client.post", () => {
    it("should not call auth.delete when revokeToken is false", async () => {
      const store = createAuthStore();
      await store.logout({
        clearCache: true,
        revokeToken: false,
        savePath: false,
        userInitiated: false,
      });

      expect(client.post).not.toHaveBeenCalledWith("/auth.delete");
    });

    it("should call auth.delete when revokeToken is true", async () => {
      const store = createAuthStore();
      await store.logout({
        clearCache: true,
        revokeToken: true,
        savePath: false,
        userInitiated: false,
      });

      expect(client.post).toHaveBeenCalledWith("/auth.delete");
    });
  });

  describe("cookies", () => {
    it("should read sessions cookie and clear it when a team is present", async () => {
      mockGetCookie.mockReturnValueOnce(null); // first call: constructor reads "lastSignedIn"
      mockGetCookie.mockReturnValueOnce(
        JSON.stringify({ "team-1": "session-data" })
      );

      const store = createAuthStore();
      store.currentTeamId = "team-1";
      // Add a minimal team so store.team returns a truthy value
      store.add({ id: "team-1", name: "Test Team" } as never);

      await store.logout({
        clearCache: true,
        revokeToken: false,
        savePath: false,
        userInitiated: true,
      });

      expect(mockGetCookie).toHaveBeenCalledWith("sessions");
      expect(mockSetCookie).toHaveBeenCalledWith(
        "sessions",
        expect.any(String),
        expect.any(Object)
      );
    });

    it("should handle missing sessions cookie gracefully", async () => {
      mockGetCookie.mockReturnValueOnce(null); // constructor reads "lastSignedIn"
      mockGetCookie.mockReturnValueOnce(null); // logout reads "sessions"

      const store = createAuthStore();
      store.currentTeamId = "team-1";
      store.add({ id: "team-1", name: "Test Team" } as never);

      await store.logout({
        clearCache: true,
        revokeToken: false,
        savePath: false,
        userInitiated: true,
      });

      expect(mockGetCookie).toHaveBeenCalledWith("sessions");
      // When sessions cookie is null, JSON.parse("null") is null, which
      // is falsy, so setCookie should still be called with "{}"
    });
  });

  describe("state cleanup", () => {
    it("should clear userId, teamId, and collaborationToken", async () => {
      const store = createAuthStore();
      store.currentUserId = "user-1";
      store.currentTeamId = "team-1";
      store.collaborationToken = "collab-token";

      await store.logout({
        clearCache: true,
        revokeToken: false,
        savePath: false,
        userInitiated: true,
      });

      expect(store.currentUserId).toBeNull();
      expect(store.currentTeamId).toBeNull();
      expect(store.collaborationToken).toBeNull();
    });
  });
});
