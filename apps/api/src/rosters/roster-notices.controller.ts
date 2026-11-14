import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { IsString, MaxLength } from "class-validator";
import { ROLE_CODES } from "@idbrf/shared";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { RequireAccess } from "../auth/decorators/require-access.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { RosterNoticesService } from "./roster-notices.service";

class EndpointBody {
  @IsString() @MaxLength(2048) endpoint!: string;
}
class SubscribeBody extends EndpointBody {
  @IsString() @MaxLength(100) p256dh!: string;
  @IsString() @MaxLength(30) auth!: string;
}
const VOLUNTEERS = [ROLE_CODES.MEMBRO, ROLE_CODES.LIDER_MINISTERIO, ROLE_CODES.SECRETARIA, ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN] as const;

@Controller("rosters/notifications")
export class RosterNoticesController {
  constructor(private readonly notices: RosterNoticesService) {}

  @Roles(...VOLUNTEERS)
  @RequireAccess({ resource: "ministries", action: "respond" })
  @Get("me")
  list(@CurrentUser() user: AuthUser) { return this.notices.list(user); }

  @Roles(...VOLUNTEERS)
  @RequireAccess({ resource: "ministries", action: "respond" })
  @Post("subscribe")
  subscribe(@CurrentUser() user: AuthUser, @Body() body: SubscribeBody) { return this.notices.subscribe(user, body); }

  @Roles(...VOLUNTEERS)
  @RequireAccess({ resource: "ministries", action: "respond" })
  @Post("unsubscribe")
  unsubscribe(@CurrentUser() user: AuthUser, @Body() body: EndpointBody) { return this.notices.unsubscribe(user, body.endpoint); }

  @Roles(...VOLUNTEERS)
  @RequireAccess({ resource: "ministries", action: "respond" })
  @Post("invites/:assignmentId/accept")
  accept(@CurrentUser() user: AuthUser, @Param("assignmentId") assignmentId: string) { return this.notices.acceptInvite(user, assignmentId); }

  @Public()
  @Post("run")
  run(@Headers("authorization") authorization?: string) { return this.notices.scheduled(authorization); }
}
