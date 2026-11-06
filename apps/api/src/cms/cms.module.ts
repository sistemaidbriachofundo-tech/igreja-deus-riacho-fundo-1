import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ChannelsModule } from "../channels/channels.module";
import { PilotModule } from "../pilot/pilot.module";
import { CmsController } from "./cms.controller";
import { CmsService } from "./cms.service";
import { SiteLayoutService } from "./site-layout.service";
import { SiteLayoutController } from "./site-layout.controller";
import { SiteTeamController } from "./site-team.controller";
import { SiteTeamService } from "./site-team.service";
import { SiteMediaService } from "./site-media.service";
import { SiteMediaController } from "./site-media.controller";

@Module({
  imports: [AuthModule, PilotModule, ChannelsModule],
  controllers: [CmsController, SiteLayoutController, SiteTeamController, SiteMediaController],
  providers: [CmsService, SiteLayoutService, SiteTeamService, SiteMediaService],
  exports: [CmsService, SiteLayoutService],
})
export class CmsModule {}
