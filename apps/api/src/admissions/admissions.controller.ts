import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { AdmissionsService } from "./admissions.service";

/**
 * Protocolo de admissão do piloto.
 * Ordem no serviço: modality → documents → secretaria → pastor.
 * Papel e escopo de congregação são validados no servidor.
 */
@Controller("admissions")
export class AdmissionsController {
  constructor(private readonly admissions: AdmissionsService) {}

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN)
  @Get()
  list(@CurrentUser() user: AuthUser, @Query("status") status?: string) {
    return this.admissions.list(user, status);
  }

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.admissions.create(user, body);
  }

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN)
  @Get(":admissionId")
  get(
    @CurrentUser() user: AuthUser,
    @Param("admissionId") admissionId: string,
  ) {
    return this.admissions.getById(user, admissionId);
  }

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN)
  @Post(":admissionId/advance")
  advance(
    @CurrentUser() user: AuthUser,
    @Param("admissionId") admissionId: string,
    @Body() body: unknown,
  ) {
    return this.admissions.advance(user, admissionId, body);
  }
}
