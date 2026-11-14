import { Body, Controller, Get, Post } from "@nestjs/common";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, MaxLength } from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { NotificationsService } from "./notifications.service";

class ReadNotices {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(220, { each: true })
  ids!: string[];
}

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() actor: AuthUser) {
    return this.notifications.list(actor);
  }

  @Get("priorities")
  priorities(@CurrentUser() actor: AuthUser) {
    return this.notifications.priorities(actor);
  }

  @Post("read")
  markRead(@CurrentUser() actor: AuthUser, @Body() body: ReadNotices) {
    return this.notifications.markRead(actor, body.ids);
  }
}
