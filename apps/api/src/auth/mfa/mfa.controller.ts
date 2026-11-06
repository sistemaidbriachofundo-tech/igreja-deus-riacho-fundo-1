import { Body, Controller, Get, Post } from "@nestjs/common";
import { IsOptional, IsString, Length, Matches } from "class-validator";
import { ROLE_CODES } from "@idbrf/shared";
import { CurrentUser } from "../decorators/current-user.decorator";
import { Roles } from "../decorators/roles.decorator";
import type { AuthUser } from "../types/auth-user";
import { MfaService } from "./mfa.service";

class EnrollTotpBody {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  label?: string;
}

class TotpCodeBody {
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}

class DisableTotpBody {
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/)
  code?: string;
}

@Controller("auth/mfa")
export class MfaController {
  constructor(private readonly mfa: MfaService) {}

  /** Qualquer papel autenticado — próprio fator. */
  @Roles(
    ROLE_CODES.MEMBRO,
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.TESOURARIA,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Get("status")
  status(@CurrentUser() user: AuthUser) {
    return this.mfa.getStatus(user);
  }

  @Roles(
    ROLE_CODES.MEMBRO,
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.TESOURARIA,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Post("totp/enroll")
  enroll(@CurrentUser() user: AuthUser, @Body() body: EnrollTotpBody) {
    return this.mfa.enrollTotp(user, body.label);
  }

  @Roles(
    ROLE_CODES.MEMBRO,
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.TESOURARIA,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Post("totp/confirm")
  confirm(@CurrentUser() user: AuthUser, @Body() body: TotpCodeBody) {
    return this.mfa.confirmTotp(user, body.code);
  }

  @Roles(
    ROLE_CODES.MEMBRO,
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.TESOURARIA,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Post("totp/disable")
  disable(@CurrentUser() user: AuthUser, @Body() body: DisableTotpBody) {
    return this.mfa.disableTotp(user, body.code);
  }
}
