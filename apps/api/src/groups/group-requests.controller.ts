import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { IsBoolean } from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { GroupRequestsService } from "./group-requests.service";

class GroupDecision {
  @IsBoolean()
  approved!: boolean;
}

@Controller("group-requests")
export class GroupRequestsController {
  constructor(private readonly requests: GroupRequestsService) {}

  @Get("catalog")
  catalog(@CurrentUser() actor: AuthUser) {
    return this.requests.catalog(actor);
  }

  @Get("inbox")
  async inbox(@CurrentUser() actor: AuthUser) {
    return { requests: await this.requests.inbox(actor) };
  }

  @Post("groups/:id")
  request(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.requests.request(actor, id);
  }

  @Post(":id/decision")
  decide(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Body() body: GroupDecision) {
    return this.requests.decide(actor, id, body.approved);
  }
}
