import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PilotModule } from "../pilot/pilot.module";
import { FinanceController } from "./finance.controller";
import { FinanceService } from "./finance.service";

@Module({
  imports: [AuthModule, PilotModule],
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
