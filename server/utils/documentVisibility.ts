import type { NavigationNode } from "@shared/types";
import { flattenTree } from "@shared/utils/tree";
import { Document } from "@server/models";
import type { User } from "@server/models";
import { can } from "@server/policies/cancan";

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
