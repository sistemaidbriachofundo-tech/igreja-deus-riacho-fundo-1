import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PilotModule } from "../pilot/pilot.module";
import { HouseholdsController } from "./households.controller";
import { HouseholdsService } from "./households.service";

@Module({
  imports: [AuthModule, PilotModule],
  controllers: [HouseholdsController],
  providers: [HouseholdsService],
})
export class HouseholdsModule {}
