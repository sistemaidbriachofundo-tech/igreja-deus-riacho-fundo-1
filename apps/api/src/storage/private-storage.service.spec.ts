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
});
