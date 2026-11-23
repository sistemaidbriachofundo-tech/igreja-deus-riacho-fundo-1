import { Controller, Get, Query } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { IndicatorsService } from "./indicators.service";

/** Não expor agregados da congregação a membros/convidados, mesmo autenticados. */
const SUMMARY_ROLES = [
  ROLE_CODES.PLATFORM_ADMIN,
  ROLE_CODES.SECRETARIA,
  ROLE_CODES.PASTOR,
  ROLE_CODES.TESOURARIA,
  ROLE_CODES.LIDER_MINISTERIO,
] as const;
const MEMBERSHIP_ROLES = [
  ROLE_CODES.PLATFORM_ADMIN,
  ROLE_CODES.SECRETARIA,
  ROLE_CODES.PASTOR,
  ROLE_CODES.TESOURARIA,
] as const;

@Controller("indicators")
export class IndicatorsController {
  constructor(private readonly indicators: IndicatorsService) {}

  /** RF-029 — resumo institucional (agregações Prisma reais). */
  @Roles(...SUMMARY_ROLES)
  @Get("summary")
  summary(
    @CurrentUser() user: AuthUser,
    @Query("churchId") churchId?: string,
    @Query("scope") scope?: string,
  ) {
    return this.indicators.summary(user, { churchId, scope });
  }

  /** RF-029 — membresia por status (groupBy real). */
  @Roles(...MEMBERSHIP_ROLES)
  @Get("membership")
  membership(
    @CurrentUser() user: AuthUser,
    @Query("churchId") churchId?: string,
  ) {
    return this.indicators.membership(user, churchId);
  }
}
