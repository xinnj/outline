import { FileOperationState, FileOperationType } from "@shared/types";
import { bytesToHumanReadable } from "@shared/utils/files";
import stores from "~/stores";
import FileOperation from "./FileOperation";

describe("FileOperation model", () => {
  const fileOperations = stores.fileOperations;
  let originalBasePath: string | undefined;

  beforeEach(() => {
    originalBasePath = window.env.BASE_PATH;
    window.env.BASE_PATH = "";
  });

  afterEach(() => {
    window.env.BASE_PATH = originalBasePath;
  });

  describe("downloadUrl", () => {
    const id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

    test("should return the redirect URL with the file operation id", () => {
      const fileOp = new FileOperation({ id }, fileOperations);
      expect(fileOp.downloadUrl).toBe(`/api/fileOperations.redirect?id=${id}`);
    });

    test("should include BASE_PATH when set", () => {
      window.env.BASE_PATH = "/kb";
      const fileOp = new FileOperation({ id }, fileOperations);
      expect(fileOp.downloadUrl).toBe(`/kb/api/fileOperations.redirect?id=${id}`);
    });

    test("should handle empty BASE_PATH", () => {
      window.env.BASE_PATH = "";
      const fileOp = new FileOperation({ id }, fileOperations);
      expect(fileOp.downloadUrl).toBe(`/api/fileOperations.redirect?id=${id}`);
    });
  });

  describe("sizeInMB", () => {
    test("should return 0 bytes for size 0", () => {
      const fileOp = new FileOperation(
        { id: "123", size: 0, type: FileOperationType.Export, state: FileOperationState.Complete },
        fileOperations
      );
      expect(fileOp.sizeInMB).toBe(bytesToHumanReadable(0));
    });

    test("should return human readable size for bytes", () => {
      const fileOp = new FileOperation(
        { id: "456", size: 1024, type: FileOperationType.Export, state: FileOperationState.Complete },
        fileOperations
      );
      expect(fileOp.sizeInMB).toBe(bytesToHumanReadable(1024));
    });

    test("should return human readable size for megabytes", () => {
      const fileOp = new FileOperation(
        { id: "789", size: 5242880, type: FileOperationType.Export, state: FileOperationState.Complete },
        fileOperations
      );
      expect(fileOp.sizeInMB).toBe(bytesToHumanReadable(5242880));
    });
  });
});
