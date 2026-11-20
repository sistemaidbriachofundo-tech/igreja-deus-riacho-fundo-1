import { Body, Controller, Get, Header, Param, Post, Query } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { Allow, IsOptional, IsString, MaxLength } from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { SystemSettingsService } from "./system-settings.service";

class DraftBody {
  @IsString() @MaxLength(80) key!: string;
  @IsOptional() @IsString() @MaxLength(20) scopeKind?: string;
  @IsOptional() @IsString() @MaxLength(80) scopeId?: string | null;
  @IsOptional() @IsString() @MaxLength(280) note?: string | null;
  @Allow()
  value!: unknown;
}

class ReviewBody {
  @IsOptional() @IsString() @MaxLength(40) expectedUpdatedAt?: string;
}

class PublishBody extends ReviewBody {
  @IsString() @MaxLength(40) effectiveFrom!: string;
  @IsOptional() @IsString() @MaxLength(40) effectiveUntil?: string | null;
}

@Controller("system-settings")
@Roles(ROLE_CODES.PLATFORM_ADMIN)
export class SystemSettingsController {
  constructor(private readonly settings: SystemSettingsService) {}

  @Get("catalog")
  @Header("Cache-Control", "private, no-store")
  catalog(@CurrentUser() actor: AuthUser) {
    return this.settings.catalog(actor);
  }

  @Get("effective")
  @Header("Cache-Control", "private, no-store")
  effective(
    @CurrentUser() actor: AuthUser,
    @Query("key") key = "",
    @Query("scopeKind") scopeKind = "",
    @Query("scopeId") scopeId?: string,
    @Query("at") at?: string,
  ) {
    return this.settings.effective(actor, key, scopeKind, scopeId, at ? new Date(at) : new Date());
  }

  @Get(":key/history")
  @Header("Cache-Control", "private, no-store")
  history(@CurrentUser() actor: AuthUser, @Param("key") key: string) {
    return this.settings.history(actor, key);
  }

  @Post("drafts")
  draft(@CurrentUser() actor: AuthUser, @Body() body: DraftBody) {
    return this.settings.draft(actor, body);
  }

  @Post("revisions/:revisionId/review")
  review(@CurrentUser() actor: AuthUser, @Param("revisionId") revisionId: string, @Body() body: ReviewBody) {
    return this.settings.review(actor, revisionId, body.expectedUpdatedAt);
  }

  @Post("revisions/:revisionId/publish")
  publish(@CurrentUser() actor: AuthUser, @Param("revisionId") revisionId: string, @Body() body: PublishBody) {
    return this.settings.publish(actor, revisionId, body);
  }
}
