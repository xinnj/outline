import env from "~/env";
import { sharedModelPath, desktopify, urlify } from "./routeHelpers";

describe("#sharedDocumentPath", () => {
  it("should return share path for a document", () => {
    const shareId = "1c922644-40d8-41fe-98f9-df2b67239d45";
    const docPath = "/doc/test-DjDlkBi77t";
    expect(sharedModelPath(shareId)).toBe(
      "/s/1c922644-40d8-41fe-98f9-df2b67239d45"
    );
    expect(sharedModelPath(shareId, docPath)).toBe(
      "/s/1c922644-40d8-41fe-98f9-df2b67239d45/doc/test-DjDlkBi77t"
    );
  });
});

describe("#urlify", () => {
  const originalBasePath = env.BASE_PATH;

  afterEach(() => {
    env.BASE_PATH = originalBasePath;
  });

  it("should prepend origin to path", () => {
    env.BASE_PATH = "";
    expect(urlify("/doc/test-DjDlkBi77t", "https://app.getoutline.com")).toBe(
      "https://app.getoutline.com/doc/test-DjDlkBi77t"
    );
  });

  it("should include BASE_PATH when sub-path is configured", () => {
    env.BASE_PATH = "/kb";
    expect(urlify("/doc/test-DjDlkBi77t", "https://ci.bizconf.cn")).toBe(
      "https://ci.bizconf.cn/kb/doc/test-DjDlkBi77t"
    );
  });

  it("should handle empty path with BASE_PATH", () => {
    env.BASE_PATH = "/outline";
    expect(urlify("/", "https://example.com")).toBe(
      "https://example.com/outline/"
    );
  });
});

describe("#desktopify", () => {
  it("should replace https protocol with outline://", () => {
    expect(
      desktopify("/doc/test-DjDlkBi77t", "https://app.getoutline.com")
    ).toBe("outline://app.getoutline.com/doc/test-DjDlkBi77t");
  });

  it("should replace http protocol with outline://", () => {
    expect(desktopify("/doc/test-DjDlkBi77t", "http://localhost:3000")).toBe(
      "outline://localhost:3000/doc/test-DjDlkBi77t"
    );
  });
});
