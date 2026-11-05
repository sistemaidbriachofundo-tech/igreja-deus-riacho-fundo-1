import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PilotModule } from "../pilot/pilot.module";
import { TransfersController } from "./transfers.controller";
import { TransfersService } from "./transfers.service";

@Module({
  imports: [AuthModule, PilotModule],
  controllers: [TransfersController],
  providers: [TransfersService],
})
export class TransfersModule {}
