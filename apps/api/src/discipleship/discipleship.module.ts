import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PilotModule } from "../pilot/pilot.module";
import { DiscipleshipController } from "./discipleship.controller";
import { DiscipleshipService } from "./discipleship.service";

@Module({
  imports: [AuthModule, PilotModule],
  controllers: [DiscipleshipController],
  providers: [DiscipleshipService],
})
export class DiscipleshipModule {}
