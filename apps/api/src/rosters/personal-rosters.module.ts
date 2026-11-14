import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PilotModule } from "../pilot/pilot.module";
import { PersonalRostersController } from "./personal-rosters.controller";
import { RosterNoticesController } from "./roster-notices.controller";
import { RosterNoticesService } from "./roster-notices.service";
import { PersonalRosterService } from "./personal-roster.service";

@Module({
  imports: [AuthModule, PilotModule],
  controllers: [PersonalRostersController, RosterNoticesController],
  providers: [PersonalRosterService, RosterNoticesService],
})
export class PersonalRostersModule {}
