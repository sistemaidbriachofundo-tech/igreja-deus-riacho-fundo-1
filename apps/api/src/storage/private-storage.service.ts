import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { dirname, join, normalize, resolve, sep } from "node:path";

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
    const safe = (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || trimmed.includes("..") || /[/\\]/.test(trimmed)) {
        throw new BadRequestException("Identificador de storage inválido");
      }
      return trimmed;
    };
    const id = randomUUID();
    return [
      "admissions",
      safe(parts.organizationId),
      safe(parts.churchId),
      safe(parts.admissionId),
      id,
    ].join("/");
  }

  private resolveSafe(storageKey: string): string {
    if (!storageKey || storageKey.includes("\0")) {
      throw new BadRequestException("storageKey inválido");
    }
    if (storageKey.includes("..") || storageKey.startsWith("/") || storageKey.startsWith("\\")) {
      throw new BadRequestException("storageKey inválido");
    }
    const normalizedKey = normalize(storageKey);
    if (
      normalizedKey.startsWith("..") ||
      normalizedKey.includes(`..${sep}`) ||
      normalizedKey.includes(`${sep}..`) ||
      normalizedKey.startsWith(sep)
    ) {
      throw new BadRequestException("storageKey inválido");
    }
    const root = this.root();
    const full = resolve(root, normalizedKey);
    if (full !== root && !full.startsWith(root + sep)) {
      throw new BadRequestException("storageKey fora do STORAGE_ROOT");
    }
    return full;
  }

  async put(storageKey: string, bytes: Buffer): Promise<void> {
    const full = this.resolveSafe(storageKey);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, bytes, { mode: 0o600 });
  }

  async get(storageKey: string): Promise<Buffer> {
    try {
      return await readFile(this.resolveSafe(storageKey));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new NotFoundException("Arquivo não encontrado no storage");
      }
      throw err;
    }
  }

  async remove(storageKey: string): Promise<void> {
    try {
      await unlink(this.resolveSafe(storageKey));
    } catch {
      // idempotente
    }
  }

  /** Hash para auditoria sem guardar o arquivo nos logs. */
  contentSha256(bytes: Buffer): string {
    return createHash("sha256").update(bytes).digest("hex");
  }
}
