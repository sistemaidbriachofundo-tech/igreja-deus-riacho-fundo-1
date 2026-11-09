import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ChannelsModule } from "../channels/channels.module";
import { PilotModule } from "../pilot/pilot.module";
import {
  MinistriesController,
  RosterAssignmentsController,
  RosterCoupleExceptionsController,
  RosterSlotsController,
  RostersController,
  VolunteerAvailabilityController,
  VolunteerImpedimentsController,
} from "./ministries.controller";
import { MinistryMembershipGateService } from "./membership/ministry-membership-gate.service";
import { MinistryScopeController } from "./membership/ministry-scope.controller";
import { MinistriesService } from "./ministries.service";

@Module({
  imports: [AuthModule, PilotModule, ChannelsModule],
  controllers: [
    MinistriesController,
    RostersController,
    RosterSlotsController,
    RosterAssignmentsController,
    VolunteerAvailabilityController,
    VolunteerImpedimentsController,
    RosterCoupleExceptionsController,
    MinistryScopeController,
  ],
  providers: [MinistriesService, MinistryMembershipGateService],
})
export class MinistriesModule {}
