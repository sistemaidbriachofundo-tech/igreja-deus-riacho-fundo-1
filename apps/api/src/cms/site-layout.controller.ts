import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { IsDateString, IsObject, IsOptional } from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { SiteLayoutService } from "./site-layout.service";

class SaveSiteLayoutBody {
  @IsObject()
  layout!: object;

  @IsOptional()
  @IsDateString()
  expectedUpdatedAt?: string | null;
}
class PublishSiteLayoutBody {
  @IsOptional()
  @IsDateString()
  expectedUpdatedAt?: string;
}

@Roles(ROLE_CODES.EDITOR_SITE, ROLE_CODES.PUBLICADOR_SITE, ROLE_CODES.SECRETARIA, ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN)
@Controller("cms/site-layout")
export class SiteLayoutController {
  constructor(private readonly site: SiteLayoutService) {}

  @Get()
  editor(@CurrentUser() user: AuthUser) {
    return this.site.editor(user);
  }

  @Patch("draft")
  draft(@CurrentUser() user: AuthUser, @Body() body: SaveSiteLayoutBody) {
    return this.site.saveDraft(user, body.layout, body.expectedUpdatedAt);
  }

  @Post("publish")
  publish(@CurrentUser() user: AuthUser, @Body() body: PublishSiteLayoutBody) {
    return this.site.publish(user, body.expectedUpdatedAt);
  }

  @Post("restore/:revisionId")
  restore(@CurrentUser() user: AuthUser, @Param("revisionId") revisionId: string) {
    return this.site.restore(user, revisionId);
  }
}
