import type { Page } from "@playwright/test";

interface CapturedRequest {
  url: string;
  method: string;
  postData: unknown;
}

/**
 * Intercepts API calls on the given page and records them for later assertion.
 * Uses page.route() to capture without blocking.
 *
 * @returns An object with the captured requests and assertion helpers.
 */
export async function interceptApiCalls(page: Page, basePath: string) {
  const apiRequests: CapturedRequest[] = [];

  await page.route(`${basePath}/api/**`, async (route) => {
    const request = route.request();
    apiRequests.push({
      url: request.url(),
      method: request.method(),
      postData: request.postDataJSON(),
    });
    await route.continue();
  });

  return {
    /** All captured API requests since interception began. */
    requests: apiRequests,

    /** Assert a matching request was made. */
    assertRequest: (
      method: string,
      pathPattern: RegExp,
      message?: string
    ): CapturedRequest => {
      const found = apiRequests.find(
        (r) => r.method === method && pathPattern.test(r.url)
      );
      if (!found) {
        const allRequests = apiRequests
          .map((r) => `${r.method} ${r.url}`)
          .join("\n  ");
        throw new Error(
          message ??
            `Expected ${method} request matching ${pathPattern}, but got:\n  ${allRequests || "(none)"}`
        );
      }
      return found;
    },

    /** Assert no matching request was made. */
    assertNoRequest: (method: string, pathPattern: RegExp, message?: string) => {
      const found = apiRequests.find(
        (r) => r.method === method && pathPattern.test(r.url)
      );
      if (found) {
        throw new Error(
          message ??
            `Expected no ${method} request matching ${pathPattern}, but found: ${found.method} ${found.url}`
        );
      }
    },

    /** Clear captured requests to start fresh for the next interaction. */
    clear: () => {
      apiRequests.length = 0;
    },
  };
}

/**
 * Wait for a specific API request to be made. Useful for non-intercepting
 * assertions where you want to verify exact URL and query params.
 *
 * @returns A promise that resolves with the matched request.
 */
export function waitForApiRequest(
  page: Page,
  method: string,
  urlPattern: string | RegExp
) {
  return page.waitForRequest((req) => {
    if (req.method() !== method) {
      return false;
    }
    if (typeof urlPattern === "string") {
      return req.url().includes(urlPattern);
    }
    return urlPattern.test(req.url());
  });
}

/**
 * Wait for an API response matching the given criteria.
 */
export function waitForApiResponse(
  page: Page,
  method: string,
  urlPattern: string | RegExp
) {
  return page.waitForResponse((res) => {
    if (res.request().method() !== method) {
      return false;
    }
    if (typeof urlPattern === "string") {
      return res.request().url().includes(urlPattern);
    }
    return urlPattern.test(res.request().url());
  });
}
