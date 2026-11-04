import { Body, Controller, Get, Post } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import {
  MembershipsService,
  type RegisterMembershipInput,
} from "./memberships.service";

class RegisterMembershipBody implements RegisterMembershipInput {
  displayName!: string;
  email?: string;
  notes?: string;
  householdLabel?: string;
  personId?: string;
}

/**
 * Secretaria — listagem e cadastro de membresia no piloto Riacho Fundo I.
 * Escopo validado no service (grants SECRETARIA × church piloto).
 */
@Controller("memberships")
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.memberships.listForPilot(user);
  }

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Post()
  register(
    @CurrentUser() user: AuthUser,
    @Body() body: RegisterMembershipBody,
  ) {
    return this.memberships.register(user, body);
  }
}
