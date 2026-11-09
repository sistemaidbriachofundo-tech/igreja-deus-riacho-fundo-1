import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { canManageSpecificMinistry } from "@idbrf/shared";
import type { AuthUser } from "../../auth/types/auth-user";
import { requireMinistryInPilot } from "../../common/ministry-access";
import { PilotService } from "../../pilot/pilot.service";
import { PrismaService } from "../../prisma/prisma.service";
import {
  MINISTRY_AGENDA_MODEL_BLOCKED,
  MINISTRY_FINANCE_CONTRACT_BLOCKED,
  MINISTRY_INTEREST_CONVERSION_BLOCKED,
  MINISTRY_MEMBERSHIP_SCHEMA_BLOCKED,
  MINISTRY_REQUEST_MODEL_BLOCKED,
  MINISTRY_SCOPE_FORBIDDEN,
} from "./ministry-membership.contract";

/**
 * Porta de escopo do vínculo formal.
 * Não lê volunteer_interests, não escreve pessoa e não consulta o ledger.
 * Sem tabela MinistryMembership, o escopo autorizado termina em 501.
 */
@Injectable()
export class MinistryMembershipGateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  async readMemberships(actor: AuthUser, ministryId: string) {
    await this.assertScope(actor, ministryId);
    this.blocked(MINISTRY_MEMBERSHIP_SCHEMA_BLOCKED, {
      dependency: "schema.prisma",
      issue: 97,
      members: null,
      message:
        "O cadastro formal de integrante ainda não tem tabela. Interesse de voluntariado não ocupa este lugar.",
    });
  }

  async convertInterest(
    actor: AuthUser,
    ministryId: string,
    volunteerInterestId: string,
  ) {
    await this.assertScope(actor, ministryId);
    const interestId = volunteerInterestId?.trim();
    if (!interestId) {
      throw new BadRequestException("volunteerInterestId é obrigatório");
    }
    this.blocked(MINISTRY_INTEREST_CONVERSION_BLOCKED, {
      dependency: "schema.prisma",
      issue: 97,
      volunteerInterestId: interestId,
      createdMembership: null,
      message:
        "Converter interesse em integrante é uma ação separada e ainda não persiste. A etapa do voluntariado não cria vínculo.",
    });
  }

  async readAgenda(actor: AuthUser, ministryId: string) {
    const ministry = await this.assertScope(actor, ministryId);
    this.blocked(MINISTRY_AGENDA_MODEL_BLOCKED, {
      dependency: "schema.prisma",
      issue: 97,
      scheduleText: ministry.scheduleText ?? null,
      items: null,
      message:
        "Há apenas o horário livre do perfil. A agenda estruturada não existe e as escalas globais ficam de fora deste escopo.",
    });
  }

  async readRequests(actor: AuthUser, ministryId: string) {
    await this.assertScope(actor, ministryId);
    this.blocked(MINISTRY_REQUEST_MODEL_BLOCKED, {
      dependency: "schema.prisma",
      issue: 97,
      requests: null,
      message:
        "Solicitações do ministério ainda não têm modelo. Nenhuma fila foi inventada.",
    });
  }

  async readCostCenterBalance(actor: AuthUser, ministryId: string) {
    await this.assertScope(actor, ministryId);
    this.blocked(MINISTRY_FINANCE_CONTRACT_BLOCKED, {
      dependency: "issue-96",
      issue: 96,
      balance: null,
      message:
        "O saldo do centro de custo ministerial depende do contrato financeiro. Nenhum valor foi calculado.",
    });
  }

  private async assertScope(actor: AuthUser, ministryId: string) {
    const pilot = await this.pilot.getPilotChurch();
    const ministry = await requireMinistryInPilot(
      this.prisma,
      ministryId,
      pilot,
      "notFound",
    );
    const allowed = canManageSpecificMinistry(actor.grants, actor.personId, {
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      ministryId: ministry.id,
      leaderPersonId: ministry.leaderPersonId,
    });
    if (!allowed) {
      throw new ForbiddenException({
        statusCode: 403,
        error: "Forbidden",
        code: MINISTRY_SCOPE_FORBIDDEN,
        message: "Líder só visualiza dados do ministério autorizado.",
      });
    }
    return ministry;
  }

  private blocked(code: string, body: Record<string, unknown>): never {
    throw new HttpException(
      {
        statusCode: 501,
        error: "Not Implemented",
        code,
        blocked: true,
        ...body,
      },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}
