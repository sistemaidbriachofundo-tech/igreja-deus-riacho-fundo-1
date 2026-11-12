import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PilotModule } from "../pilot/pilot.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
import { MembershipInsightsController } from "./membership-insights.controller";
import { MembershipInsightsService } from "./membership-insights.service";

@Module({
  imports: [AuthModule, PilotModule],
  controllers: [ReportsController, MembershipInsightsController],
  providers: [ReportsService, MembershipInsightsService],
  exports: [ReportsService],
})
export class ReportsModule {}
