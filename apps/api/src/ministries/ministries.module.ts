import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PilotModule } from "../pilot/pilot.module";
import {
  MinistriesController,
  RosterAssignmentsController,
  RosterSlotsController,
  RostersController,
} from "./ministries.controller";
import { MinistriesService } from "./ministries.service";

@Module({
  imports: [AuthModule, PilotModule],
  controllers: [
    MinistriesController,
    RostersController,
    RosterSlotsController,
    RosterAssignmentsController,
  ],
  providers: [MinistriesService],
})
export class MinistriesModule {}
