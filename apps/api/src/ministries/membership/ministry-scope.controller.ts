import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { IsString, MinLength } from "class-validator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import type { AuthUser } from "../../auth/types/auth-user";
import { MinistryMembershipGateService } from "./ministry-membership-gate.service";

class ConvertInterestBody {
  @IsString()
  @MinLength(1)
  volunteerInterestId!: string;
}

const SCOPE_ROLES = [
  ROLE_CODES.SECRETARIA,
  ROLE_CODES.PASTOR,
  ROLE_CODES.LIDER_MINISTERIO,
  ROLE_CODES.PLATFORM_ADMIN,
] as const;

@Controller("ministry-scope")
@Roles(...SCOPE_ROLES)
export class MinistryScopeController {
  constructor(private readonly gate: MinistryMembershipGateService) {}

  @Get(":ministryId/formal-memberships")
  memberships(
    @CurrentUser() user: AuthUser,
    @Param("ministryId") ministryId: string,
  ) {
    return this.gate.readMemberships(user, ministryId);
  }

  @Post(":ministryId/formal-memberships/from-interest")
  convert(
    @CurrentUser() user: AuthUser,
    @Param("ministryId") ministryId: string,
    @Body() body: ConvertInterestBody,
  ) {
    return this.gate.convertInterest(user, ministryId, body.volunteerInterestId);
  }

  @Get(":ministryId/agenda")
  agenda(
    @CurrentUser() user: AuthUser,
    @Param("ministryId") ministryId: string,
  ) {
    return this.gate.readAgenda(user, ministryId);
  }

  @Get(":ministryId/requests")
  requests(
    @CurrentUser() user: AuthUser,
    @Param("ministryId") ministryId: string,
  ) {
    return this.gate.readRequests(user, ministryId);
  }

  @Get(":ministryId/cost-center-balance")
  balance(
    @CurrentUser() user: AuthUser,
    @Param("ministryId") ministryId: string,
  ) {
    return this.gate.readCostCenterBalance(user, ministryId);
  }
}
