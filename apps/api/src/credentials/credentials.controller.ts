import { Controller, Get, Param, Post, Res } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import type { Response } from "express";
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
   * Gera PDF real (pdfkit) com QR opaco — secretaria ou titular.
   * Substitui o stub de metadados do blueprint F2/F3.
   */
  @Roles(
    ROLE_CODES.MEMBRO,
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Post(":credentialId/pdf")
  generatePdf(
    @CurrentUser() user: AuthUser,
    @Param("credentialId") credentialId: string,
  ) {
    return this.credentials.generatePdf(user, credentialId);
  }

  /** Metadados do PDF — sem bytes públicos. */
  @Roles(
    ROLE_CODES.MEMBRO,
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Get(":credentialId/pdf-meta")
  pdfMeta(
    @CurrentUser() user: AuthUser,
    @Param("credentialId") credentialId: string,
  ) {
    return this.credentials.getPdfMeta(user, credentialId);
  }

  /**
   * Abre a carteirinha da mesma membresia (ativa ou, se não houver, a revogada).
   * Declarado antes de `:credentialId` para o segmento fixo não cair no id.
   */
  @Roles(ROLE_CODES.MEMBRO, ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Get("by-membership/:membershipId")
  byMembership(
    @CurrentUser() user: AuthUser,
    @Param("membershipId") membershipId: string,
  ) {
    return this.credentials.getByMembership(user, membershipId);
  }

  /** Abre uma carteirinha pelo id. Secretaria no escopo ou o próprio titular. */
  @Roles(ROLE_CODES.MEMBRO, ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Get(":credentialId")
  getOne(
    @CurrentUser() user: AuthUser,
    @Param("credentialId") credentialId: string,
  ) {
    return this.credentials.getById(user, credentialId);
  }

  /** Download autenticado do PDF privado. */
  @Roles(
    ROLE_CODES.MEMBRO,
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Get(":credentialId/pdf")
  async downloadPdf(
    @CurrentUser() user: AuthUser,
    @Param("credentialId") credentialId: string,
    @Res({ passthrough: false }) res: Response,
  ) {
    const file = await this.credentials.downloadPdf(user, credentialId);
    res.setHeader("Content-Type", file.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.displayName.replace(/"/g, "")}"`,
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(file.bytes);
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
