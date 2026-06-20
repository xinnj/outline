import sharedEnv from "@shared/env";
import env from "@server/env";
import onerror from "@server/onerror";
import webService from "@server/services/web";
import TestServer from "@server/test/TestServer";

let server: TestServer;
const originalURL = env.URL;
const subpathURL = "https://app.example.com/outline";

beforeAll(async () => {
  env.URL = sharedEnv.URL = subpathURL;
  const app = webService();
  onerror(app);
  server = new TestServer(app);
});

// The global test setup resets env.URL to https://app.example.com before each
// test, which triggers cloud-hosted mode and breaks sub-path routing. Restore
// the sub-path URL after it runs.
beforeEach(() => {
  env.URL = sharedEnv.URL = subpathURL;
});

afterAll(() => {
  env.URL = sharedEnv.URL = originalURL;
  return server.close();
});

describe("sub-path deployment", () => {
  it("serves the app shell at the sub-path", async () => {
    const res = await server.get("/outline/");
    expect(res.status).toEqual(200);
    const body = await res.text();
    expect(body).toContain("<div id=\"root\">");
  });

  it("does not serve the app shell at root", async () => {
    const res = await server.get("/");
    expect(res.status).toEqual(404);
  });

  it("scopes OIDC discovery endpoints under the sub-path", async () => {
    const res = await server.get(
      "/outline/.well-known/oauth-authorization-server"
    );
    expect(res.status).toEqual(200);
    const body = await res.json();
    expect(body.issuer).toBe("https://app.example.com/outline");
    expect(body.authorization_endpoint).toBe(
      "https://app.example.com/outline/oauth/authorize"
    );
    expect(body.token_endpoint).toBe(
      "https://app.example.com/outline/oauth/token"
    );
  });

  it("sets the CSRF cookie path to the sub-path", async () => {
    const res = await server.get("/outline/");
    const cookie = res.headers.get("set-cookie");
    expect(cookie).not.toBeNull();
    expect(cookie).toContain("path=/outline");
  });

  it("returns 404 for scanner paths under the sub-path", async () => {
    const res = await server.get("/outline/.env");
    expect(res.status).toEqual(404);
    const body = await res.text();
    expect(body).not.toContain("<title>");
  });
});
