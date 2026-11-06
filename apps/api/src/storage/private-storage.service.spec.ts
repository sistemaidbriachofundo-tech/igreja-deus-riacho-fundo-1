import { BadRequestException } from "@nestjs/common";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrivateStorageService } from "./private-storage.service";

describe("PrivateStorageService", () => {
  let root: string;
  const prev = process.env.STORAGE_ROOT;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "idbrf-storage-"));
    process.env.STORAGE_ROOT = root;
  });

  afterEach(async () => {
    process.env.STORAGE_ROOT = prev;
    await rm(root, { recursive: true, force: true });
  });

  it("writes and reads private bytes", async () => {
    const storage = new PrivateStorageService();
    const key = storage.buildAdmissionKey({
      organizationId: "org",
      churchId: "ch",
      admissionId: "adm",
    });
    const bytes = Buffer.from("%PDF-demo-fake");
    await storage.put(key, bytes);
    await expect(storage.get(key)).resolves.toEqual(bytes);
    expect(storage.contentSha256(bytes)).toHaveLength(64);
    await storage.remove(key);
  });

  it("builds credential PDF keys under credentials/", async () => {
    const storage = new PrivateStorageService();
    const key = storage.buildCredentialPdfKey({
      organizationId: "org",
      churchId: "ch",
      credentialId: "cred1",
    });
    expect(key.startsWith("credentials/org/ch/cred1/")).toBe(true);
    expect(key.endsWith(".pdf")).toBe(true);
  });

  it("rejects path traversal keys", async () => {
    const storage = new PrivateStorageService();
    await expect(storage.get("../etc/passwd")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(storage.put("a/../../etc/passwd", Buffer.from("x"))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(() =>
      storage.buildAdmissionKey({
        organizationId: "../x",
        churchId: "ch",
        admissionId: "adm",
      }),
    ).toThrow(BadRequestException);
  });
});
