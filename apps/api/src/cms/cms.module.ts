import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ChannelsModule } from "../channels/channels.module";
import { PilotModule } from "../pilot/pilot.module";
import { CmsController } from "./cms.controller";
import { CmsService } from "./cms.service";
import { SiteLayoutService } from "./site-layout.service";
import { SiteLayoutController } from "./site-layout.controller";
import { SiteMediaController } from "./site-media.controller";
import { SiteMediaService } from "./site-media.service";

@Module({
  imports: [AuthModule, PilotModule, ChannelsModule],
  controllers: [CmsController, SiteLayoutController, SiteMediaController],
  providers: [CmsService, SiteLayoutService, SiteMediaService],
  exports: [CmsService, SiteLayoutService],
})
export class CmsModule {}
