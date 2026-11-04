import { Controller, Get } from "@nestjs/common";
import { HealthService } from "./health.service";

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getHello() {
    return this.healthService.getHello();
  }

  @Get("health")
  getHealth() {
    return this.healthService.getHealth();
  }
}
