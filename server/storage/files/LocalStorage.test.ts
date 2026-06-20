import env from "@server/env";
import LocalStorage from "./LocalStorage";

describe("LocalStorage", () => {
  let storage: LocalStorage;
  let originalUrl: string;

  beforeEach(() => {
    storage = new LocalStorage();
    originalUrl = env.URL;
  });

  afterEach(() => {
    env.URL = originalUrl;
  });

  describe("getUploadUrl", () => {
    it("should return upload URL at the API path", () => {
      expect(storage.getUploadUrl()).toBe("/api/files.create");
    });

    it("should include basePath when URL has a path component", () => {
      env.URL = "https://app.outline.dev/kb";
      expect(storage.getUploadUrl()).toBe("/kb/api/files.create");
    });

    it("should handle URL without path", () => {
      env.URL = "https://app.outline.dev";
      expect(storage.getUploadUrl()).toBe("/api/files.create");
    });
  });

  describe("getUrlForKey", () => {
    const key = "uploads/team-id/doc-id/file.png";

    it("should return file URL with the key", () => {
      expect(storage.getUrlForKey(key)).toBe(`/api/files.get?key=${key}`);
    });

    it("should include basePath when URL has a path component", () => {
      env.URL = "https://app.outline.dev/kb";
      expect(storage.getUrlForKey(key)).toBe(`/kb/api/files.get?key=${key}`);
    });

    it("should handle URL without path", () => {
      env.URL = "https://app.outline.dev";
      expect(storage.getUrlForKey(key)).toBe(`/api/files.get?key=${key}`);
    });
  });
});
