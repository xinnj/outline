import type { NavigationNode } from "@shared/types";
import { flattenTree } from "@shared/utils/tree";
import { Document } from "@server/models";
import type { User } from "@server/models";
import { can } from "@server/policies/cancan";

/**
 * Returns the ids, from the given list, of documents that have stopped
 * inheriting permissions from their parent (`inheritPermission === false`).
 *
 * @param ids The document ids to check.
 * @returns A set of the restricted document ids.
 */
export const getStoppedInheritanceDocumentIds = async (
  ids: string[]
): Promise<Set<string>> => {
  if (ids.length === 0) {
    return new Set();
  }

  const restricted = await Document.unscoped().findAll({
    attributes: ["id"],
    where: {
      id: ids,
      inheritPermission: false,
    },
  });

  return new Set(restricted.map((doc) => doc.id));
};

/**
 * Filters a shared collection/document structure to remove documents that have
 * stopped inheriting permissions (`inheritPermission === false`). A share
 * grants access through inheritance from the shared root, so restricted
 * documents — and any of their descendants — are removed. The root node itself
 * is always preserved, as a document share explicitly targets its root
 * document.
 *
 * @param node The shared structure to filter.
 * @returns A filtered copy of the structure, or null when no node is given.
 */
export const filterDocumentStructureForShare = async (
  node: NavigationNode | null
): Promise<NavigationNode | null> => {
  if (!node) {
    return null;
  }

  const ids = flattenTree(node).map((n) => n.id);
  const hiddenIds = await getStoppedInheritanceDocumentIds(ids);

  if (hiddenIds.size === 0) {
    return node;
  }

  const prune = (current: NavigationNode): NavigationNode => ({
    ...current,
    children: (current.children ?? [])
      .filter((child) => !hiddenIds.has(child.id))
      .map(prune),
  });

  return prune(node);
};

/**
 * Filters a collection's document structure (sidebar tree) to remove documents
 * the given user cannot read. Only documents with inheritance disabled
 * (`inheritPermission === false`) can be hidden — everything else inherits
 * access from the collection. Hidden nodes are removed along with their
 * children.
 *
 * @param nodes The document structure to filter.
 * @param user The user to filter for.
 * @returns A filtered copy of the document structure.
 */
export const filterDocumentStructureForUser = async (
  nodes: NavigationNode[],
  user: User
): Promise<NavigationNode[]> => {
  const ids = [
    ...new Set(nodes.flatMap((node) => flattenTree(node).map((n) => n.id))),
  ];

  if (ids.length === 0) {
    return nodes;
  }

  // Only documents with inheritance disabled can be hidden from a user who
  // can otherwise read the collection. Load those with the user's memberships
  // preloaded so the policy can be evaluated.
  const candidates = await Document.withMembershipScope(user.id).findAll({
    where: {
      id: ids,
      inheritPermission: false,
    },
  });

  const hiddenIds = new Set(
    candidates
      .filter((document) => !can(user, "read", document))
      .map((document) => document.id)
  );

  if (hiddenIds.size === 0) {
    return nodes;
  }

  const prune = (list: NavigationNode[]): NavigationNode[] =>
    list
      .filter((node) => !hiddenIds.has(node.id))
      .map((node) => ({ ...node, children: prune(node.children ?? []) }));

  return prune(nodes);
};
