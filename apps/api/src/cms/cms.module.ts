import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ChannelsModule } from "../channels/channels.module";
import { PilotModule } from "../pilot/pilot.module";
import { CmsController } from "./cms.controller";
import { CmsService } from "./cms.service";
import { SiteLayoutService } from "./site-layout.service";
import { SiteLayoutController } from "./site-layout.controller";

@Module({
  imports: [AuthModule, PilotModule, ChannelsModule],
  controllers: [CmsController, SiteLayoutController],
  providers: [CmsService, SiteLayoutService],
  exports: [CmsService, SiteLayoutService],
})
export class CmsModule {}
