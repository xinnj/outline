import env from "@server/env";
import { Attachment } from "@server/models";

describe("Attachment", () => {
  describe("getRedirectUrl", () => {
    const id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    let originalUrl: string;

    beforeEach(() => {
      originalUrl = env.URL;
    });

    afterEach(() => {
      env.URL = originalUrl;
    });

    it("should return redirect URL with the attachment id", () => {
      expect(Attachment.getRedirectUrl(id)).toBe(
        `/api/attachments.redirect?id=${id}`
      );
    });

    it("should include basePath when URL has a path component", () => {
      env.URL = "https://app.outline.dev/kb";
      expect(Attachment.getRedirectUrl(id)).toBe(
        `/kb/api/attachments.redirect?id=${id}`
      );
    });

    it("should handle URL without path", () => {
      env.URL = "https://app.outline.dev";
      expect(Attachment.getRedirectUrl(id)).toBe(
        `/api/attachments.redirect?id=${id}`
      );
    });

    it("should handle URL with trailing slash", () => {
      env.URL = "https://app.outline.dev/outline/";
      expect(Attachment.getRedirectUrl(id)).toBe(
        `/outline/api/attachments.redirect?id=${id}`
      );
    });
  });
});
