import { Body, Controller, Get, Post } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { IsEmail, IsString, MinLength } from "class-validator";
import { AuthService } from "./auth.service";
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

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("login")
  login(@Body() body: LoginBody) {
    return this.authService.login({
      email: body.email ?? "",
      password: body.password ?? "",
    });
  }

  /** Quem sou eu — exige JWT (inclui claims organizationId/churchId). */
  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  /**
   * Refresh mobile-ready: revalida grants no DB e reemite access token
   * preservando congregação ativa quando ainda coberta.
   */
  @Post("refresh")
  refresh(@CurrentUser() user: AuthUser) {
    return this.authService.refresh(user);
  }

  /**
   * Troca congregação ativa no JWT (F6).
   * Exige grant que cubra `churchId`. Produto default continua RF1.
   */
  @Post("switch-church")
  switchChurch(@CurrentUser() user: AuthUser, @Body() body: SwitchChurchBody) {
    return this.authService.switchChurch(user, body.churchId);
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
