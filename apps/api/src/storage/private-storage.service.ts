import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { dirname, normalize, resolve, sep } from "node:path";

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
    const safe = this.safeSegment;
    const id = randomUUID();
    return [
      "admissions",
      safe(parts.organizationId),
      safe(parts.churchId),
      safe(parts.admissionId),
      id,
    ].join("/");
  }

  /** Chave opaca para PDF de carteirinha (STORAGE_ROOT privado). */
  buildCredentialPdfKey(parts: {
    organizationId: string;
    churchId: string;
    credentialId: string;
  }): string {
    const safe = this.safeSegment;
    const id = randomUUID();
    return [
      "credentials",
      safe(parts.organizationId),
      safe(parts.churchId),
      safe(parts.credentialId),
      `${id}.pdf`,
    ].join("/");
  }

  /** Chave opaca para PDF de carta oficial (STORAGE_ROOT privado). */
  buildLetterPdfKey(parts: {
    organizationId: string;
    churchId: string;
    letterId: string;
  }): string {
    const safe = this.safeSegment;
    const id = randomUUID();
    return [
      "letters",
      safe(parts.organizationId),
      safe(parts.churchId),
      safe(parts.letterId),
      `${id}.pdf`,
    ].join("/");
  }

  /**
   * Chave opaca para foto de pessoa (STORAGE_ROOT privado).
   * Path seguro reservado — upload/resize binário fora desta fatia (RF-001 stub).
   */
  buildPersonPhotoKey(parts: {
    organizationId: string;
    personId: string;
    extension?: string;
  }): string {
    const safe = this.safeSegment;
    const id = randomUUID();
    const ext = (parts.extension ?? "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
    return [
      "persons",
      safe(parts.organizationId),
      safe(parts.personId),
      "photo",
      `${id}.${ext}`,
    ].join("/");
  }

  /** Comprovante/anexo de lançamento financeiro (STORAGE_ROOT privado). */
  buildLedgerAttachmentKey(parts: {
    organizationId: string;
    churchId: string;
    entryId: string;
    extension?: string;
  }): string {
    const safe = this.safeSegment;
    const id = randomUUID();
    const ext =
      (parts.extension ?? "bin").replace(/[^a-z0-9]/gi, "").toLowerCase() ||
      "bin";
    return [
      "ledger",
      safe(parts.organizationId),
      safe(parts.churchId),
      safe(parts.entryId),
      `${id}.${ext}`,
    ].join("/");
  }

  private safeSegment(value: string): string {
    const trimmed = value.trim();
    if (!trimmed || trimmed.includes("..") || /[/\\]/.test(trimmed)) {
      throw new BadRequestException("Identificador de storage inválido");
    }
    return trimmed;
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
