import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "./prisma/prisma.service";
import { APP_NAME, createHealthStatus, type HealthStatus } from "@idbrf/shared";
import { mfaBlockingEnabled } from "./auth/privileged-roles";
import { usesDurableAuthState } from "./auth/session/auth-state.tokens";

function releaseCommit(env: NodeJS.ProcessEnv = process.env): string | null {
  const sha = env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase() ?? "";
  return /^[0-9a-f]{7,40}$/.test(sha) ? sha.slice(0, 12) : null;
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Readiness separado de liveness: não sinalizar API pronta sem Postgres. */
  async getReadiness(): Promise<{
    status: "ready";
    service: "api";
    database: "ok";
    commit: string | null;
    authState: "prisma" | "memory";
    mfaBlocking: boolean;
  }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: "ready",
        service: "api",
        database: "ok",
        commit: releaseCommit(),
        authState: usesDurableAuthState() ? "prisma" : "memory",
        mfaBlocking: mfaBlockingEnabled(),
      };
    } catch {
      throw new ServiceUnavailableException({
        status: "unavailable", service: "api", database: "unavailable",
      });
    }
  }
  getHealth(): HealthStatus & { app: string } {
    return {
      ...createHealthStatus("api"),
      app: APP_NAME,
    };
  }

  getHello(): { message: string; app: string } {
    return {
      message:
        "Olá — API do sistema Igreja de Deus Riacho Fundo I (skeleton F1 IAM)",
      app: APP_NAME,
    };
  }
}
