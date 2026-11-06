import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "./prisma/prisma.service";
import { APP_NAME, createHealthStatus, type HealthStatus } from "@idbrf/shared";

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Readiness separado de liveness: não sinalizar API pronta sem Postgres. */
  async getReadiness(): Promise<{ status: "ready"; service: "api"; database: "ok" }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ready", service: "api", database: "ok" };
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
