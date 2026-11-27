import { Controller, Get, Query } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { IndicatorsService } from "./indicators.service";

const INDICATOR_STAFF = [
  ROLE_CODES.SECRETARIA,
  ROLE_CODES.PASTOR,
  ROLE_CODES.PLATFORM_ADMIN,
] as const;

@Controller("indicators")
export class IndicatorsController {
  constructor(private readonly indicators: IndicatorsService) {}

  /** RF-029 — resumo institucional (agregações Prisma reais). */
  @Roles(...INDICATOR_STAFF, ROLE_CODES.LIDER_MINISTERIO)
  @Get("summary")
  summary(
    @CurrentUser() user: AuthUser,
    @Query("churchId") churchId?: string,
    @Query("scope") scope?: string,
  ) {
    return this.indicators.summary(user, { churchId, scope });
  }

  /** RF-029 — membresia por status (groupBy real). */
  @Roles(...INDICATOR_STAFF)
  @Get("membership")
  membership(
    @CurrentUser() user: AuthUser,
    @Query("churchId") churchId?: string,
  ) {
    return this.indicators.membership(user, churchId);
  }
}
