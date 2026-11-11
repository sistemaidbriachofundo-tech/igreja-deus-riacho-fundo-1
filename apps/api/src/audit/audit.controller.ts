import { Controller, Get, Headers, Query } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { normalizeCorrelationHeader } from "./audit-command";
import { AuditService } from "./audit.service";

@Controller("audit-logs")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN)
  @Get("export")
  exportLogs(
    @CurrentUser() user: AuthUser,
    @Query("limit") limit?: string,
    @Query("churchId") churchId?: string,
    @Query("scope") scope?: string,
    @Query("cursor") cursor?: string,
    @Query("action") action?: string,
    @Query("resourceType") resourceType?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("outcome") outcome?: string,
    @Headers("x-request-id") requestId?: string,
    @Headers("x-correlation-id") correlationHeader?: string,
  ) {
    return this.audit.exportSanitized(user, limit ? Number(limit) : 200, {
      churchId,
      scope,
      cursor,
      action,
      resourceType,
      from,
      to,
      outcome,
      correlationId: correlationOf(correlationHeader, requestId),
    });
  }

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN)
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("limit") limit?: string,
    @Query("churchId") churchId?: string,
    @Query("scope") scope?: string,
    @Query("cursor") cursor?: string,
    @Query("action") action?: string,
    @Query("resourceType") resourceType?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("outcome") outcome?: string,
    @Headers("x-request-id") requestId?: string,
    @Headers("x-correlation-id") correlationHeader?: string,
  ) {
    return this.audit.listRecent(user, limit ? Number(limit) : 50, {
      churchId,
      scope,
      cursor,
      action,
      resourceType,
      from,
      to,
      outcome,
      correlationId: correlationOf(correlationHeader, requestId),
    });
  }
}

function correlationOf(
  correlationHeader?: string,
  requestId?: string,
): string | undefined {
  return (
    normalizeCorrelationHeader(correlationHeader) ??
    normalizeCorrelationHeader(requestId)
  );
}
