import { Controller, Get, Query, Res } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import type { Response } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { ReportsService } from "./reports.service";

const PARTICIPATION_ROLES = [
  ROLE_CODES.SECRETARIA,
  ROLE_CODES.PASTOR,
  ROLE_CODES.PLATFORM_ADMIN,
  ROLE_CODES.LIDER_MINISTERIO,
] as const;

const MEMBERSHIP_ROLES = [
  ROLE_CODES.SECRETARIA,
  ROLE_CODES.PASTOR,
  ROLE_CODES.PLATFORM_ADMIN,
] as const;

const MINISTRY_COST_ROLES = [
  ROLE_CODES.TESOURARIA,
  ROLE_CODES.SECRETARIA,
  ROLE_CODES.PASTOR,
  ROLE_CODES.PLATFORM_ADMIN,
  ROLE_CODES.LIDER_MINISTERIO,
] as const;

@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Roles(...PARTICIPATION_ROLES)
  @Get("participation")
  participation(
    @CurrentUser() user: AuthUser,
    @Query("eventId") eventId?: string,
    @Query("status") status?: string,
    @Query("ministryId") ministryId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.reports.participation(user, {
      eventId,
      status,
      ministryId,
      from,
      to,
    });
  }

  @Roles(...PARTICIPATION_ROLES)
  @Get("participation.csv")
  participationCsv(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query("eventId") eventId?: string,
    @Query("status") status?: string,
    @Query("ministryId") ministryId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.send(
      res,
      this.reports.participationFile(
        user,
        { eventId, status, ministryId, from, to },
        "csv",
      ),
    );
  }

  @Roles(...PARTICIPATION_ROLES)
  @Get("participation.pdf")
  participationPdf(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query("eventId") eventId?: string,
    @Query("status") status?: string,
    @Query("ministryId") ministryId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.send(
      res,
      this.reports.participationFile(
        user,
        { eventId, status, ministryId, from, to },
        "pdf",
      ),
    );
  }

  @Roles(...MEMBERSHIP_ROLES)
  @Get("membership")
  membership(
    @CurrentUser() user: AuthUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.reports.membership(user, { from, to });
  }

  @Roles(...MEMBERSHIP_ROLES)
  @Get("membership.csv")
  membershipCsv(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.send(res, this.reports.membershipFile(user, "csv", { from, to }));
  }

  @Roles(...MEMBERSHIP_ROLES)
  @Get("membership.pdf")
  membershipPdf(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.send(res, this.reports.membershipFile(user, "pdf", { from, to }));
  }

  @Roles(...PARTICIPATION_ROLES)
  @Get("ministries")
  ministries(
    @CurrentUser() user: AuthUser,
    @Query("ministryId") ministryId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.reports.ministries(user, ministryId, { from, to });
  }

  @Roles(...PARTICIPATION_ROLES)
  @Get("ministries.csv")
  ministriesCsv(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query("ministryId") ministryId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.send(
      res,
      this.reports.ministriesFile(user, ministryId, "csv", { from, to }),
    );
  }

  @Roles(...PARTICIPATION_ROLES)
  @Get("ministries.pdf")
  ministriesPdf(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query("ministryId") ministryId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.send(
      res,
      this.reports.ministriesFile(user, ministryId, "pdf", { from, to }),
    );
  }

  @Roles(...MINISTRY_COST_ROLES)
  @Get("ministry-cost")
  ministryCost(
    @CurrentUser() user: AuthUser,
    @Query("ministryId") ministryId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.reports.ministryCost(user, { ministryId, from, to });
  }

  @Roles(...MINISTRY_COST_ROLES)
  @Get("ministry-cost.csv")
  ministryCostCsv(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query("ministryId") ministryId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.send(
      res,
      this.reports.ministryCostFile(user, { ministryId, from, to }, "csv"),
    );
  }

  @Roles(...MINISTRY_COST_ROLES)
  @Get("ministry-cost.pdf")
  ministryCostPdf(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query("ministryId") ministryId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.send(
      res,
      this.reports.ministryCostFile(user, { ministryId, from, to }, "pdf"),
    );
  }

  private async send(
    res: Response,
    pending: ReturnType<ReportsService["participationFile"]>,
  ) {
    const file = await pending;
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    res.send(file.bytes);
  }
}
