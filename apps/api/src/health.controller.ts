import { Controller, Get } from "@nestjs/common";
import { Public } from "./auth/decorators/public.decorator";
import { HealthService } from "./health.service";

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  getHello() {
    return this.healthService.getHello();
  }

  @Public()
  @Get("health")
  getHealth() {
    return this.healthService.getHealth();
  }

  @Public()
  @Get("ready")
  getReady() {
    return this.healthService.getReadiness();
  }
}
