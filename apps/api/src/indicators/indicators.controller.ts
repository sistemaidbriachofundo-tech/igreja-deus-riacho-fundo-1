import { Controller, Get, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { IndicatorsService } from "./indicators.service";

@Controller("indicators")
export class IndicatorsController {
  constructor(private readonly indicators: IndicatorsService) {}

  /** Stub F6 — resumo institucional (leitura). */
  @Get("summary")
  summary(
    @CurrentUser() user: AuthUser,
    @Query("churchId") churchId?: string,
    @Query("scope") scope?: string,
  ) {
    return this.indicators.summary(user, { churchId, scope });
  }

  /** Stub F6 — membresia por status (leitura). */
  @Get("membership")
  membership(
    @CurrentUser() user: AuthUser,
    @Query("churchId") churchId?: string,
  ) {
    return this.indicators.membership(user, churchId);
  }
}
