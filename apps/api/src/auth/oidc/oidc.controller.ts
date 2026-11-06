import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { ROLE_CODES } from "@idbrf/shared";
import { CurrentUser } from "../decorators/current-user.decorator";
import { Public } from "../decorators/public.decorator";
import { Roles } from "../decorators/roles.decorator";
import type { AuthUser } from "../types/auth-user";
import { OidcService } from "./oidc.service";

class UpsertOidcBody {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  issuerUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  clientId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  clientSecretRef?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  redirectUri?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  scopes?: string | null;

  @IsOptional()
  @IsIn(["DISABLED", "CONFIGURED", "ENABLED"])
  status?: "DISABLED" | "CONFIGURED" | "ENABLED";
}

@Controller("auth/oidc")
export class OidcController {
  constructor(private readonly oidc: OidcService) {}

  @Roles(ROLE_CODES.PLATFORM_ADMIN)
  @Get("config")
  getConfig(@CurrentUser() user: AuthUser) {
    return this.oidc.getConfig(user);
  }

  @Roles(ROLE_CODES.PLATFORM_ADMIN)
  @Put("config")
  putConfig(@CurrentUser() user: AuthUser, @Body() body: UpsertOidcBody) {
    return this.oidc.upsertConfig(user, body);
  }

  /** Alias POST para clientes que não enviam PUT. */
  @Roles(ROLE_CODES.PLATFORM_ADMIN)
  @Post("config")
  postConfig(@CurrentUser() user: AuthUser, @Body() body: UpsertOidcBody) {
    return this.oidc.upsertConfig(user, body);
  }

  /**
   * Interface pública do authorize — sem redirect live.
   * Documenta contrato OpenAPI; IdP real fica para F0/PEN.
   */
  @Public()
  @Get("authorize")
  authorize() {
    return this.oidc.getAuthorizeInterface();
  }

  @Public()
  @Get("callback")
  callback(
    @Query("code") code?: string,
    @Query("state") state?: string,
    @Query("error") error?: string,
  ) {
    return this.oidc.handleCallbackInterface({ code, state, error });
  }
}
