import { Controller, Get, Query } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { MembershipInsightsService } from "./membership-insights.service";

@Controller("reports")
export class MembershipInsightsController {
  constructor(private readonly insights: MembershipInsightsService) {}

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
