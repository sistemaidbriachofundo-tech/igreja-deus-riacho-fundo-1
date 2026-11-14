import { Body, Controller, Get, Header, Param, Post } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { EventRegistrationsService } from "./event-registrations.service";
import { PublicRegistrationBody } from "./registration.dto";

@Controller("member-events")
@Roles(ROLE_CODES.MEMBRO)
export class MemberEventsController {
  constructor(private readonly registrations: EventRegistrationsService) {}

  @Get("registrations")
  @Header("Cache-Control", "private, no-store")
  list(@CurrentUser() actor: AuthUser) {
    return this.registrations.listMyRegistrations(actor);
  }

  @Get("registrations/:registrationId")
  @Header("Cache-Control", "private, no-store")
  get(@CurrentUser() actor: AuthUser, @Param("registrationId") registrationId: string) {
    return this.registrations.getMyRegistration(actor, registrationId);
  }

  @Post(":slug/registrations")
  @Header("Cache-Control", "private, no-store")
  create(@CurrentUser() actor: AuthUser, @Param("slug") slug: string, @Body() body: PublicRegistrationBody) {
    return this.registrations.createMemberRegistration(actor, slug, body);
  }
}
