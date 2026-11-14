import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PilotModule } from "../pilot/pilot.module";
import { GroupRequestsController } from "./group-requests.controller";
import { GroupRequestsService } from "./group-requests.service";
import { GroupsController } from "./groups.controller";
import { GroupsService } from "./groups.service";

@Module({
  imports: [AuthModule, PilotModule],
  controllers: [GroupsController, GroupRequestsController],
  providers: [GroupsService, GroupRequestsService],
  exports: [GroupRequestsService],
})
export class GroupsModule {}
