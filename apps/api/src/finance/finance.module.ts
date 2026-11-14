import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PilotModule } from "../pilot/pilot.module";
import { StorageModule } from "../storage/storage.module";
import { FinanceController } from "./finance.controller";
import { FinanceService } from "./finance.service";
import { ReceivingAccountController } from "./receiving-account.controller";
import { ReceivingAccountService } from "./receiving-account.service";

@Module({
  imports: [AuthModule, PilotModule, StorageModule],
  controllers: [FinanceController, ReceivingAccountController],
  providers: [FinanceService, ReceivingAccountService],
  exports: [FinanceService, ReceivingAccountService],
})
export class FinanceModule {}
