import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { canManageTransfers } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";

const LETTER_TYPES = [
  "TRANSFERENCIA",
  "RECOMENDACAO",
  "MEMBRESIA",
  "OUTRO",
] as const;

@Injectable()
export class LettersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  private assertManage(actor: AuthUser, organizationId: string, churchId: string) {
    if (!canManageTransfers(actor.grants, { organizationId, churchId })) {
      throw new ForbiddenException("Sem permissão para cartas");
    }
  }

  async list(actor: AuthUser, personId?: string) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertManage(actor, pilot.organizationId, pilot.churchId);
    const rows = await this.prisma.churchLetter.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        ...(personId ? { personId } : {}),
      },
      orderBy: [{ personId: "asc" }, { letterType: "asc" }, { version: "desc" }],
      take: 100,
    });
    return { churchId: pilot.churchId, letters: rows.map((r) => this.toDto(r)) };
  }

  async create(
    actor: AuthUser,
    input: {
      personId: string;
      letterType: string;
      title: string;
      bodyText: string;
    },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertManage(actor, pilot.organizationId, pilot.churchId);

    if (!LETTER_TYPES.includes(input.letterType as (typeof LETTER_TYPES)[number])) {
      throw new BadRequestException("letterType inválido");
    }
    const title = input.title?.trim();
    const bodyText = input.bodyText?.trim();
    if (!title || !bodyText) {
      throw new BadRequestException("title e bodyText são obrigatórios");
    }

    const person = await this.prisma.person.findFirst({
      where: { id: input.personId, organizationId: pilot.organizationId },
    });
    if (!person) throw new BadRequestException("Pessoa não encontrada");

    const latest = await this.prisma.churchLetter.findFirst({
      where: {
        personId: person.id,
        churchId: pilot.churchId,
        letterType: input.letterType as (typeof LETTER_TYPES)[number],
      },
      orderBy: { version: "desc" },
    });

    const row = await this.prisma.churchLetter.create({
      data: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        personId: person.id,
        letterType: input.letterType as (typeof LETTER_TYPES)[number],
        status: "DRAFT",
        title,
        bodyText,
        version: (latest?.version ?? 0) + 1,
        supersedesId: latest?.id ?? null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "letter.create",
        resourceType: "church_letter",
        resourceId: row.id,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        metadata: { personId: person.id, version: row.version },
      },
    });

    return this.toDto(row);
  }

  async issue(actor: AuthUser, letterId: string) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertManage(actor, pilot.organizationId, pilot.churchId);
    const row = await this.prisma.churchLetter.findFirst({
      where: {
        id: letterId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
    if (!row) throw new NotFoundException("Carta não encontrada");
    if (row.status !== "DRAFT") {
      throw new BadRequestException("Só rascunhos podem ser emitidos");
    }

    const updated = await this.prisma.churchLetter.update({
      where: { id: row.id },
      data: {
        status: "ISSUED",
        issuedAt: new Date(),
        issuedByUserId: actor.userId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "letter.issue",
        resourceType: "church_letter",
        resourceId: row.id,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        metadata: { version: row.version },
      },
    });

    return this.toDto(updated);
  }

  async revoke(actor: AuthUser, letterId: string) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertManage(actor, pilot.organizationId, pilot.churchId);
    const row = await this.prisma.churchLetter.findFirst({
      where: {
        id: letterId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
    if (!row) throw new NotFoundException("Carta não encontrada");
    if (row.status !== "ISSUED") {
      throw new BadRequestException("Só cartas emitidas podem ser revogadas");
    }

    const updated = await this.prisma.churchLetter.update({
      where: { id: row.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "letter.revoke",
        resourceType: "church_letter",
        resourceId: row.id,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        metadata: {},
      },
    });

    return this.toDto(updated);
  }

  private toDto(row: {
    id: string;
    personId: string;
    letterType: string;
    status: string;
    title: string;
    bodyText: string;
    version: number;
    supersedesId: string | null;
    issuedAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      personId: row.personId,
      letterType: row.letterType,
      status: row.status,
      title: row.title,
      bodyText: row.bodyText,
      version: row.version,
      supersedesId: row.supersedesId,
      issuedAt: row.issuedAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
