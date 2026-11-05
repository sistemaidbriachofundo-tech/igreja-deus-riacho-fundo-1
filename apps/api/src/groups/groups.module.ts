import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PilotModule } from "../pilot/pilot.module";
import { GroupsController } from "./groups.controller";
import { GroupsService } from "./groups.service";

@Module({
  imports: [AuthModule, PilotModule],
  controllers: [GroupsController],
  providers: [GroupsService],
})
export class GroupsModule {}
