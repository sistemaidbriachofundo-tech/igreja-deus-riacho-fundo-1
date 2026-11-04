import { Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

/**
 * Storage privado local (DEV/HML). Não serve arquivos via URL pública.
 * Em PRD: trocar por object storage com bucket privado + signed URL curta.
 */
@Injectable()
export class PrivateStorageService {
  private root(): string {
    const configured = process.env.STORAGE_ROOT?.trim();
    if (configured) {
      return resolve(configured);
    }
    return resolve(process.cwd(), ".data", "private-storage");
  }

  buildAdmissionKey(parts: {
    organizationId: string;
    churchId: string;
    admissionId: string;
  }): string {
    const id = randomUUID();
    return join(
      "admissions",
      parts.organizationId,
      parts.churchId,
      parts.admissionId,
      id,
    );
  }

  async put(storageKey: string, bytes: Buffer): Promise<void> {
    const full = join(this.root(), storageKey);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, bytes, { mode: 0o600 });
  }

  async get(storageKey: string): Promise<Buffer> {
    return readFile(join(this.root(), storageKey));
  }

  async remove(storageKey: string): Promise<void> {
    try {
      await unlink(join(this.root(), storageKey));
    } catch {
      // idempotente
    }
  }

  /** Hash para auditoria sem guardar o arquivo nos logs. */
  contentSha256(bytes: Buffer): string {
    return createHash("sha256").update(bytes).digest("hex");
  }
}
