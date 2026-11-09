import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PilotModule } from "../pilot/pilot.module";
import { PersonalRostersController } from "./personal-rosters.controller";
import { PersonalRosterService } from "./personal-roster.service";

@Module({
  imports: [AuthModule, PilotModule],
  controllers: [PersonalRostersController],
  providers: [PersonalRosterService],
})
export class PersonalRostersModule {}
