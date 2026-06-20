import env from "@server/env";

describe("Environment#basePath", () => {
  const originalURL = env.URL;

  afterEach(() => {
    env.URL = originalURL;
  });

  it("returns empty string for a root URL", () => {
    env.URL = "https://app.outline.dev";
    expect(env.basePath).toBe("");
  });

  it("returns empty string for a root URL with trailing slash", () => {
    env.URL = "https://app.outline.dev/";
    expect(env.basePath).toBe("");
  });

  it("extracts the path from a sub-path URL", () => {
    env.URL = "https://app.outline.dev/outline";
    expect(env.basePath).toBe("/outline");
  });

  it("strips trailing slash from a sub-path URL", () => {
    env.URL = "https://app.outline.dev/outline/";
    expect(env.basePath).toBe("/outline");
  });

  it("handles multi-segment sub-paths", () => {
    env.URL = "https://app.outline.dev/kb/internal/";
    expect(env.basePath).toBe("/kb/internal");
  });

  it("returns empty string for an invalid URL", () => {
    env.URL = "not-a-url";
    expect(env.basePath).toBe("");
  });
});
