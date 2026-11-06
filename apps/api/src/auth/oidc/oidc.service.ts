import {
  ForbiddenException,
  Injectable,
  NotImplementedException,
} from "@nestjs/common";
import { canManageOidcConfig } from "@idbrf/shared";
import type { AuthUser } from "../types/auth-user";
import { PrismaService } from "../../prisma/prisma.service";
import { PilotService } from "../../pilot/pilot.service";

export interface UpsertOidcConfigInput {
  displayName?: string | null;
  issuerUrl?: string | null;
  clientId?: string | null;
  /** Nome da env (ex.: OIDC_CLIENT_SECRET) — nunca o valor do secret. */
  clientSecretRef?: string | null;
  redirectUri?: string | null;
  scopes?: string | null;
  /** DISABLED | CONFIGURED | ENABLED — ENABLED sem IdP live só marca intenção. */
  status?: "DISABLED" | "CONFIGURED" | "ENABLED";
}

/**
 * Hooks OIDC — configuração + contrato de authorize/callback.
 * Não chama IdP real neste contrato (PEN / F0 ainda aberto).
 */
@Injectable()
export class OidcService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  async getConfig(actor: AuthUser) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertAdmin(actor, pilot.organizationId);

    const row = await this.prisma.oidcProviderConfig.findUnique({
      where: { organizationId: pilot.organizationId },
    });

    return {
      organizationId: pilot.organizationId,
      liveIdp: false,
      config: row ? this.toPublic(row) : null,
      envHints: {
        OIDC_ISSUER_URL: process.env.OIDC_ISSUER_URL?.trim() || null,
        OIDC_CLIENT_ID: process.env.OIDC_CLIENT_ID?.trim() || null,
        OIDC_REDIRECT_URI: process.env.OIDC_REDIRECT_URI?.trim() || null,
        OIDC_SCOPES: process.env.OIDC_SCOPES?.trim() || "openid profile email",
        /** Secret só por ref — valor nunca ecoado. */
        OIDC_CLIENT_SECRET_REF:
          process.env.OIDC_CLIENT_SECRET_REF?.trim() || "OIDC_CLIENT_SECRET",
      },
    };
  }

  async upsertConfig(actor: AuthUser, input: UpsertOidcConfigInput) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertAdmin(actor, pilot.organizationId);

    const status = input.status ?? "CONFIGURED";
    const data = {
      displayName: input.displayName?.trim() || null,
      issuerUrl: input.issuerUrl?.trim() || null,
      clientId: input.clientId?.trim() || null,
      clientSecretRef: input.clientSecretRef?.trim() || "OIDC_CLIENT_SECRET",
      redirectUri: input.redirectUri?.trim() || null,
      scopes: input.scopes?.trim() || "openid profile email",
      status,
    };

    const row = await this.prisma.oidcProviderConfig.upsert({
      where: { organizationId: pilot.organizationId },
      create: {
        organizationId: pilot.organizationId,
        ...data,
      },
      update: data,
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "oidc.config.upsert",
        resourceType: "oidc_provider_config",
        resourceId: row.id,
        organizationId: pilot.organizationId,
        metadata: { status: row.status, liveIdp: false },
      },
    });

    return {
      organizationId: pilot.organizationId,
      liveIdp: false,
      config: this.toPublic(row),
    };
  }

  /**
   * Interface de authorize — documenta o contrato sem redirecionar a IdP.
   */
  getAuthorizeInterface() {
    return {
      liveIdp: false,
      status: "not_live",
      message:
        "OIDC authorize é interface apenas — configure IdP (F0/PEN) antes de ativar",
      next: {
        method: "GET",
        path: "/auth/oidc/authorize",
        whenLive: "302 redirect para authorization_endpoint do issuer",
      },
      requiredEnv: [
        "OIDC_ISSUER_URL",
        "OIDC_CLIENT_ID",
        "OIDC_CLIENT_SECRET",
        "OIDC_REDIRECT_URI",
      ],
    };
  }

  /**
   * Interface de callback — não troca code por tokens neste contrato.
   */
  handleCallbackInterface(query: Record<string, string | undefined>) {
    throw new NotImplementedException({
      liveIdp: false,
      status: "not_live",
      message:
        "OIDC callback não troca authorization code — IdP live fora deste contrato",
      code: "OIDC_NOT_LIVE",
      received: {
        hasCode: Boolean(query.code),
        hasState: Boolean(query.state),
        error: query.error ?? null,
      },
    });
  }

  private assertAdmin(actor: AuthUser, organizationId: string): void {
    if (!canManageOidcConfig(actor.grants, { organizationId })) {
      throw new ForbiddenException(
        "Somente PLATFORM_ADMIN pode gerir OIDC nesta organização",
      );
    }
  }

  private toPublic(row: {
    id: string;
    status: string;
    displayName: string | null;
    issuerUrl: string | null;
    clientId: string | null;
    clientSecretRef: string | null;
    redirectUri: string | null;
    scopes: string;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      status: row.status,
      displayName: row.displayName,
      issuerUrl: row.issuerUrl,
      clientId: row.clientId,
      clientSecretRef: row.clientSecretRef,
      redirectUri: row.redirectUri,
      scopes: row.scopes,
      updatedAt: row.updatedAt.toISOString(),
      /** Nunca devolver secret em claro. */
      clientSecret: null,
    };
  }
}
