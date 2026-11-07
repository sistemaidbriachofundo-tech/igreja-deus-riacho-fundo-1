import { Controller, Get, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { IndicatorsService } from "./indicators.service";

@Controller("indicators")
export class IndicatorsController {
  constructor(private readonly indicators: IndicatorsService) {}

  /** RF-029 — resumo institucional (agregações Prisma reais). */
  @Get("summary")
  summary(
    @CurrentUser() user: AuthUser,
    @Query("churchId") churchId?: string,
    @Query("scope") scope?: string,
  ) {
    return this.indicators.summary(user, { churchId, scope });
  }

  /** RF-029 — membresia por status (groupBy real). */
  @Get("membership")
  membership(
    @CurrentUser() user: AuthUser,
    @Query("churchId") churchId?: string,
  ) {
    return this.indicators.membership(user, churchId);
  }
}
