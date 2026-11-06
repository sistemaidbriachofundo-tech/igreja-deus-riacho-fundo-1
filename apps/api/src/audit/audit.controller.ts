import { Controller, Get, Query } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { AuditService } from "./audit.service";

@Controller("audit-logs")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("limit") limit?: string,
    @Query("churchId") churchId?: string,
    @Query("scope") scope?: string,
  ) {
    return this.audit.listRecent(user, limit ? Number(limit) : 50, {
      churchId,
      scope,
    });
  }
}
