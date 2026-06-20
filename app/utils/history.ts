import type { Location, LocationDescriptorObject } from "history";
import { createBrowserHistory } from "history";
import env from "~/env";

/**
 * Creates a location descriptor from an existing location with the given fields
 * overridden. Only the pathname, search, hash, and state are carried over so
 * that internal fields (such as key) are not duplicated into the new entry.
 *
 * @param location The location to patch, typically history.location.
 * @param patch The location fields to override.
 * @returns A location descriptor suitable for history.push or history.replace.
 */
export function patchLocation(
  location: Location,
  patch: LocationDescriptorObject
): LocationDescriptorObject {
  const { pathname, search, hash, state } = location;
  return { pathname, search, hash, state, ...patch };
}

const history = createBrowserHistory({
  // Serve the app under a sub-path when BASE_PATH is set (e.g. "/outline").
  basename: env.BASE_PATH || undefined,
});

export default history;
