import { Controller, Get, Header, Query } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { MembershipInsightsService } from "./membership-insights.service";

@Controller("reports")
export class MembershipInsightsController {
  constructor(private readonly insights: MembershipInsightsService) {}

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN)
  @Header("Cache-Control", "private, no-store")
  @Get("birthdays")
  birthdays(@CurrentUser() user: AuthUser, @Query("period") period?: string) {
    return this.insights.birthdays(user, period);
  }

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN)
  @Header("Cache-Control", "private, no-store")
  @Get("membership-map")
  map(@CurrentUser() user: AuthUser) {
    return this.insights.map(user);
  }

  /** Somente leitura e escopo autorizado; sem consultas anônimas. */
  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN)
  @Get("membership-insights")
  overview(
    @CurrentUser() user: AuthUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.insights.overview(user, { from, to });
  }
}
