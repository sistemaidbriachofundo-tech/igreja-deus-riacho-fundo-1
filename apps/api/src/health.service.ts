import { Injectable } from "@nestjs/common";
import { APP_NAME, createHealthStatus, type HealthStatus } from "@idbrf/shared";

@Injectable()
export class HealthService {
  getHealth(): HealthStatus & { app: string } {
    return {
      ...createHealthStatus("api"),
      app: APP_NAME,
    };
  }

  getHello(): { message: string; app: string } {
    return {
      message: "Olá — API do sistema Igreja de Deus Riacho Fundo I (skeleton F1-SEC)",
      app: APP_NAME,
    };
  }
}
