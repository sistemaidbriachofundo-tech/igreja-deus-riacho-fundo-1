import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
} from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { IsOptional, IsString, MinLength } from "class-validator";
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
