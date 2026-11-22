import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PilotModule } from "../pilot/pilot.module";
import { ServiceOrdersController } from "./service-orders.controller";
import { ServiceOrdersService } from "./service-orders.service";
import { ServiceOrderPlannerService } from "./service-order-planner.service";

@Module({
  imports: [AuthModule, PilotModule],
  controllers: [ServiceOrdersController],
  providers: [ServiceOrdersService, ServiceOrderPlannerService],
})
export class ServiceOrdersModule {}
