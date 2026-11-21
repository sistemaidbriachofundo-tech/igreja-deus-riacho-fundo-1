import { Controller, Get, Header, Post, Query } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { BirthdayNoticesService } from "./birthday-notices.service";

@Controller("reports")
@Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN)
export class BirthdayNoticesController {
  constructor(private readonly notices: BirthdayNoticesService) {}

  @Get("birthday-audiences")
  @Header("Cache-Control", "private, no-store")
  audience(
    @CurrentUser() actor: AuthUser,
    @Query("ministryId") ministryId?: string,
    @Query("groupId") groupId?: string,
    @Query("mentorPersonId") mentorPersonId?: string,
    @Query("trackId") trackId?: string,
    @Query("exclusiveTrack") exclusiveTrack?: string,
  ) {
    return this.notices.audience(actor, {
      ministryId, groupId, mentorPersonId, trackId, exclusiveTrack: exclusiveTrack === "1",
    });
  }

  @Post("birthday-notices/run")
  run(@CurrentUser() actor: AuthUser) {
    return this.notices.run(actor);
  }
}
