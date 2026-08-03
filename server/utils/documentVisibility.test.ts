import { CollectionPermission, DocumentPermission, GroupPermission } from "@shared/types";
import {
  Collection,
  GroupMembership,
  GroupUser,
  UserMembership,
} from "@server/models";
import {
  buildCollection,
  buildDocument,
  buildGroup,
  buildUser,
} from "@server/test/factories";
import { filterDocumentStructureForUser } from "./documentVisibility";

const loadStructure = async (collectionId: string) => {
  const collection = await Collection.findByPk(collectionId, {
    includeDocumentStructure: true,
  });
  return collection?.documentStructure ?? [];
};

describe("filterDocumentStructureForUser", () => {
  it("should hide a stopped-inheritance document from a user without membership", async () => {
    const user = await buildUser();
    const collection = await buildCollection({
      teamId: user.teamId,
      permission: CollectionPermission.Read,
    });
    await buildDocument({
      teamId: user.teamId,
      collectionId: collection.id,
      userId: user.id,
      inheritPermission: false,
    });

    const structure = await loadStructure(collection.id);
    expect(structure.length).toBe(1);

    const filtered = await filterDocumentStructureForUser(structure, user);
    expect(filtered.length).toBe(0);
  });

  it("should keep a stopped-inheritance document when the user has a direct membership", async () => {
    const user = await buildUser();
    const collection = await buildCollection({
      teamId: user.teamId,
      permission: CollectionPermission.Read,
    });
    const document = await buildDocument({
      teamId: user.teamId,
      collectionId: collection.id,
      userId: user.id,
      inheritPermission: false,
    });
    await UserMembership.create({
      userId: user.id,
      documentId: document.id,
      createdById: user.id,
      permission: DocumentPermission.Read,
    });

    const structure = await loadStructure(collection.id);
    const filtered = await filterDocumentStructureForUser(structure, user);
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe(document.id);
  });

  it("should keep a stopped-inheritance document when a group the user belongs to has a membership", async () => {
    const user = await buildUser();
    const collection = await buildCollection({
      teamId: user.teamId,
      permission: CollectionPermission.Read,
    });
    const document = await buildDocument({
      teamId: user.teamId,
      collectionId: collection.id,
      userId: user.id,
      inheritPermission: false,
    });
    const group = await buildGroup({
      teamId: user.teamId,
      userId: user.id,
    });
    await GroupUser.create({
      groupId: group.id,
      userId: user.id,
      createdById: user.id,
      permission: GroupPermission.Member,
    });
    await GroupMembership.create({
      groupId: group.id,
      documentId: document.id,
      createdById: user.id,
      permission: DocumentPermission.Read,
    });

    const structure = await loadStructure(collection.id);
    const filtered = await filterDocumentStructureForUser(structure, user);
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe(document.id);
  });

  it("should keep an inheriting document in a readable collection", async () => {
    const user = await buildUser();
    const collection = await buildCollection({
      teamId: user.teamId,
      permission: CollectionPermission.Read,
    });
    const document = await buildDocument({
      teamId: user.teamId,
      collectionId: collection.id,
      userId: user.id,
    });

    const structure = await loadStructure(collection.id);
    const filtered = await filterDocumentStructureForUser(structure, user);
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe(document.id);
  });

  it("should hide a stopped-inheritance child and its descendants", async () => {
    const user = await buildUser();
    const collection = await buildCollection({
      teamId: user.teamId,
      permission: CollectionPermission.Read,
    });
    const parent = await buildDocument({
      teamId: user.teamId,
      collectionId: collection.id,
      userId: user.id,
      inheritPermission: false,
    });
    await buildDocument({
      teamId: user.teamId,
      collectionId: collection.id,
      userId: user.id,
      parentDocumentId: parent.id,
    });

    const structure = await loadStructure(collection.id);
    expect(structure.length).toBe(1);

    const filtered = await filterDocumentStructureForUser(structure, user);
    expect(filtered.length).toBe(0);
  });
});
