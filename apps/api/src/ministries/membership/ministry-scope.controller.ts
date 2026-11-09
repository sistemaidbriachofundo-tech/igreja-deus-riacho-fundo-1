import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { IsIn, IsString, MinLength } from "class-validator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import type { AuthUser } from "../../auth/types/auth-user";
import { MinistryMembershipGateService } from "./ministry-membership-gate.service";

class ConvertInterestBody {
  @IsString()
  @MinLength(1)
  volunteerInterestId!: string;
}

class AdmitMemberBody {
  @IsString()
  @MinLength(1)
  personId!: string;

  @IsString()
  @IsIn(["LIDER", "COORDENADOR", "INTEGRANTE", "APOIO"])
  role!: string;
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

  @Post(":ministryId/formal-memberships")
  @HttpCode(201)
  admit(
    @CurrentUser() user: AuthUser,
    @Param("ministryId") ministryId: string,
    @Body() body: AdmitMemberBody,
  ) {
    return this.gate.admit(user, ministryId, body.personId, body.role);
  }

  @Post(":ministryId/formal-memberships/from-interest")
  @HttpCode(201)
  convert(
    @CurrentUser() user: AuthUser,
    @Param("ministryId") ministryId: string,
    @Body() body: ConvertInterestBody,
  ) {
    return this.gate.convertInterest(user, ministryId, body.volunteerInterestId);
  }

  @Post(":ministryId/formal-memberships/:membershipId/end")
  end(
    @CurrentUser() user: AuthUser,
    @Param("ministryId") ministryId: string,
    @Param("membershipId") membershipId: string,
  ) {
    return this.gate.endMembership(user, ministryId, membershipId);
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
