import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PilotModule } from "../pilot/pilot.module";
import { VolunteersController } from "./volunteers.controller";
import { VolunteersService } from "./volunteers.service";

@Module({
  imports: [AuthModule, PilotModule],
  controllers: [VolunteersController],
  providers: [VolunteersService],
  exports: [VolunteersService],
})
export class VolunteersModule {}
