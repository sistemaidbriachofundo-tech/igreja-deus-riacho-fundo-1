import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
} from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, Matches, MinLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequireAccess } from "../auth/decorators/require-access.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { PersonalRosterService } from "./personal-roster.service";

class AssignBody {
  @IsString()
  @MinLength(1)
  personId!: string;

  @IsOptional()
  @IsString()
  partnerPersonId?: string;

  @IsOptional()
  @IsString()
  coupleExceptionId?: string;

  @IsOptional()
  @IsBoolean()
  fromMonthlyPreview?: boolean;
}

class MonthPinBody {
  @IsString()
  @MinLength(1)
  serviceKey!: string;

  @IsString()
  @MinLength(1)
  slotKey!: string;

  @IsString()
  @MinLength(1)
  personId!: string;

  @IsOptional()
  @IsString()
  partnerPersonId?: string;
}

class SaveMonthBody {
  @Matches(/^[a-f0-9]{64}$/)
  fingerprint!: string;

  @IsOptional()
  @IsBoolean()
  recalculate?: boolean;

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => MonthPinBody)
  pins: MonthPinBody[] = [];
}

class MonthlyResponseBody {
  @Matches(/^20\d{2}-(0[1-9]|1[0-2])$/)
  month!: string;

  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  rosterIds!: string[];
}

const RESPOND_ROLES = [
  ROLE_CODES.MEMBRO,
  ROLE_CODES.LIDER_MINISTERIO,
  ROLE_CODES.SECRETARIA,
  ROLE_CODES.PASTOR,
  ROLE_CODES.PLATFORM_ADMIN,
] as const;

const LEAD_ROLES = [
  ROLE_CODES.SECRETARIA,
  ROLE_CODES.PASTOR,
  ROLE_CODES.LIDER_MINISTERIO,
  ROLE_CODES.PLATFORM_ADMIN,
] as const;

/**
 * GET /rosters/me é o contrato da agenda pessoal.
 * RequireAccess respond libera MEMBRO: o classificador de /rosters/*
 * trata GET como ministries.read, papel que o membro não tem.
 * O serviço ignora qualquer personId de query e usa só o JWT.
 * Nenhum método desta classe envia mensagem.
 */
@Controller("rosters")
export class PersonalRostersController {
  constructor(private readonly rosters: PersonalRosterService) {}

  @Roles(...RESPOND_ROLES)
  @RequireAccess({ resource: "ministries", action: "respond" })
  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.rosters.listMine(user);
  }

  @Roles(...RESPOND_ROLES)
  @RequireAccess({ resource: "ministries", action: "respond" })
  @Get("me/monthly-survey")
  monthlySurvey(@CurrentUser() user: AuthUser) {
    return this.rosters.monthlySurvey(user);
  }

  @Roles(...RESPOND_ROLES)
  @RequireAccess({ resource: "ministries", action: "respond" })
  @Post("me/monthly-survey")
  answerMonthlySurvey(@CurrentUser() user: AuthUser, @Body() body: MonthlyResponseBody) {
    return this.rosters.answerMonthlySurvey(user, body.month, body.rosterIds);
  }

  @Roles(...LEAD_ROLES)
  @Get("by-ministry/:ministryId/monthly-preview/:month")
  monthlyPreview(@CurrentUser() user: AuthUser, @Param("ministryId") ministryId: string, @Param("month") month: string) {
    return this.rosters.monthlyPreview(user, ministryId, month);
  }

  /** Simulação do mês. version 1. Não grava cultos faltantes. */
  @Roles(...LEAD_ROLES)
  @Get("by-ministry/:ministryId/month/:month")
  simulateMonth(@CurrentUser() user: AuthUser, @Param("ministryId") ministryId: string, @Param("month") month: string) {
    return this.rosters.simulateMonth(user, ministryId, month);
  }

  /**
   * Grava o mês como rascunho. 409 ROSTER_PREVIEW_STALE pede para atualizar.
   * 409 ROSTER_NOT_ELIGIBLE devolve reasonCodes. Não publica nem dispara aviso.
   */
  @Roles(...LEAD_ROLES)
  @Post("by-ministry/:ministryId/month/:month")
  saveMonth(@CurrentUser() user: AuthUser, @Param("ministryId") ministryId: string, @Param("month") month: string, @Body() body: SaveMonthBody) {
    return this.rosters.saveMonth(user, ministryId, month, body);
  }

  @Roles(...LEAD_ROLES)
  @Get("by-ministry/:ministryId")
  byMinistry(
    @CurrentUser() user: AuthUser,
    @Param("ministryId") ministryId: string,
  ) {
    return this.rosters.listMinistry(user, ministryId);
  }

  @Roles(...LEAD_ROLES)
  @Header("Cache-Control", "private, no-store")
  @Get(":rosterId/preview")
  preview(@CurrentUser() user: AuthUser, @Param("rosterId") rosterId: string) {
    return this.rosters.preview(user, rosterId);
  }

  @Roles(...LEAD_ROLES)
  @Post(":rosterId/preview/apply")
  applyPreview(
    @CurrentUser() user: AuthUser,
    @Param("rosterId") rosterId: string,
    @Body("fingerprint") fingerprint: unknown,
  ) {
    if (typeof fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(fingerprint)) {
      throw new BadRequestException("Gere uma prévia antes de preencher o rascunho.");
    }
    return this.rosters.applyPreview(user, rosterId, fingerprint);
  }

  @Roles(...LEAD_ROLES)
  @Post("slots/:slotId/assign")
  assign(
    @CurrentUser() user: AuthUser,
    @Param("slotId") slotId: string,
    @Body() body: AssignBody,
  ) {
    return this.rosters.assign(user, slotId, body);
  }

  @Roles(...RESPOND_ROLES)
  @RequireAccess({ resource: "ministries", action: "respond" })
  @Post("assignments/:assignmentId/confirm")
  confirm(
    @CurrentUser() user: AuthUser,
    @Param("assignmentId") assignmentId: string,
  ) {
    return this.rosters.confirm(user, assignmentId);
  }

  @Roles(...RESPOND_ROLES)
  @RequireAccess({ resource: "ministries", action: "respond" })
  @Post("assignments/:assignmentId/decline")
  decline(
    @CurrentUser() user: AuthUser,
    @Param("assignmentId") assignmentId: string,
  ) {
    return this.rosters.decline(user, assignmentId);
  }

  @Roles(...LEAD_ROLES)
  @Post("assignments/:assignmentId/substitute")
  substitute(
    @CurrentUser() user: AuthUser,
    @Param("assignmentId") assignmentId: string,
    @Body() body: AssignBody,
  ) {
    return this.rosters.substitute(user, assignmentId, body);
  }
}
