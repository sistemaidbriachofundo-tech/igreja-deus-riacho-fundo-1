import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { IsIn, IsString, MinLength } from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { AccessScopesService } from "./access-scopes.service";

class BindBody {
  @IsString() @MinLength(1) grantId!: string;
  @IsIn(["MINISTRY", "MODULE", "GROUP", "TRACK"]) kind!: "MINISTRY" | "MODULE" | "GROUP" | "TRACK";
  @IsString() @MinLength(1) scopeId!: string;
}

@Controller("admin/access-scopes")
@Roles(ROLE_CODES.PLATFORM_ADMIN)
export class AccessScopesController {
  constructor(private readonly scopes: AccessScopesService) {}

  @Get()
  list(@CurrentUser() actor: AuthUser, @Query("userId") userId = "") {
    return this.scopes.list(actor, userId);
  }

  @Post()
  bind(@CurrentUser() actor: AuthUser, @Body() body: BindBody) {
    return this.scopes.bind(actor, body);
  }

  @Delete(":bindingId")
  remove(@CurrentUser() actor: AuthUser, @Param("bindingId") bindingId: string) {
    return this.scopes.remove(actor, bindingId);
  }
}
