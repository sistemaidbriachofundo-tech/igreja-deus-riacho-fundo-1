import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from "class-validator";
import { AuthService } from "./auth.service";
import { clientAddress } from "./login/client-address";
import { CurrentUser } from "./decorators/current-user.decorator";
import { Public } from "./decorators/public.decorator";
import { Roles } from "./decorators/roles.decorator";
import type { AuthUser } from "./types/auth-user";

class LoginBody {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

class SwitchChurchBody {
  @IsString()
  @MinLength(1)
  churchId!: string;
}

class MfaChallengeBody {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  challengeId!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}

class EnrollChallengeBody {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  challengeId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  label?: string;
}

interface AddressableRequest {
  ip?: string;
  socket?: { remoteAddress?: string | null };
}

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("login")
  login(@Body() body: LoginBody, @Req() request?: AddressableRequest) {
    return this.authService.login({
      email: body.email ?? "",
      password: body.password ?? "",
      clientIp: request ? clientAddress(request) : undefined,
    });
  }

  /** Conclui o login privilegiado. Não emite sessão antes deste passo. */
  @Public()
  @Post("mfa/challenge")
  verifyMfa(@Body() body: MfaChallengeBody) {
    return this.authService.verifyMfaChallenge({
      challengeId: body.challengeId,
      code: body.code,
    });
  }

  /** Enrollment preso ao desafio de quem ainda não tem TOTP. Não abre sessão. */
  @Public()
  @Post("mfa/enroll")
  beginEnroll(@Body() body: EnrollChallengeBody) {
    return this.authService.beginMfaEnrollment({
      challengeId: body.challengeId,
      label: body.label,
    });
  }

  @Public()
  @Post("mfa/enroll/confirm")
  confirmEnroll(@Body() body: MfaChallengeBody) {
    return this.authService.confirmMfaEnrollment({
      challengeId: body.challengeId,
      code: body.code,
    });
  }

  /** Quem sou eu — exige JWT de sessão viva (inclui claims organizationId/churchId). */
  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  /**
   * Renova a sessão viva. Perfil privilegiado só renova se o MFA já foi cumprido.
   * O token anterior deixa de valer.
   */
  @Post("refresh")
  refresh(@CurrentUser() user: AuthUser) {
    return this.authService.refresh(user);
  }

  /**
   * Troca congregação ativa no JWT (F6).
   * Exige sessão viva e grant que cubra `churchId`.
   */
  @Post("switch-church")
  switchChurch(@CurrentUser() user: AuthUser, @Body() body: SwitchChurchBody) {
    return this.authService.switchChurch(user, body.churchId);
  }

  @Post("logout")
  logout(@CurrentUser() user: AuthUser) {
    return this.authService.logout(user);
  }

  @Post("logout-all")
  logoutAll(@CurrentUser() user: AuthUser) {
    return this.authService.logoutAll(user);
  }

  /**
   * Rota de smoke do stub RBAC (SECRETARIA).
   * Só responde 200 se o token tiver o papel.
   */
  @Roles(ROLE_CODES.SECRETARIA)
  @Get("rbac-smoke")
  rbacSmoke(@CurrentUser() user: AuthUser) {
    return {
      ok: true,
      personId: user.personId,
      roles: user.grants.map((g) => g.roleCode),
      organizationId: user.organizationId,
      churchId: user.churchId,
    };
  }
}
