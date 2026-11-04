import { Controller, Get, Param, Post } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { CredentialsService } from "./credentials.service";

@Controller("credentials")
export class CredentialsController {
  constructor(private readonly credentials: CredentialsService) {}

  /** Membro: própria carteirinha ativa. */
  @Roles(ROLE_CODES.MEMBRO, ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.credentials.getOwn(user);
  }

  /** Secretaria: emitir carteirinha (exige admissão APPROVED). */
  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Post("issue/:membershipId")
  issue(
    @CurrentUser() user: AuthUser,
    @Param("membershipId") membershipId: string,
  ) {
    return this.credentials.issue(user, membershipId);
  }

  /** Secretaria: revogar ativa (se houver) e emitir nova. */
  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Post("reissue/:membershipId")
  reissue(
    @CurrentUser() user: AuthUser,
    @Param("membershipId") membershipId: string,
  ) {
    return this.credentials.reissue(user, membershipId);
  }

  /** Secretaria: revogar carteirinha. */
  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Post("revoke/:credentialId")
  revoke(
    @CurrentUser() user: AuthUser,
    @Param("credentialId") credentialId: string,
  ) {
    return this.credentials.revoke(user, credentialId);
  }

  /**
   * Validação de QR (token opaco). Público mínimo — sem PII no token.
   * Em Pages estático não há API; útil em API local / Hostinger.
   */
  @Public()
  @Get("verify/:opaqueToken")
  verify(@Param("opaqueToken") opaqueToken: string) {
    return this.credentials.lookupByOpaqueToken(opaqueToken);
  }
}
