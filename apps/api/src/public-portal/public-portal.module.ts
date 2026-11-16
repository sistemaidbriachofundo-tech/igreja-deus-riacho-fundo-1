import { Module } from "@nestjs/common";
import { PilotModule } from "../pilot/pilot.module";
import { CmsModule } from "../cms/cms.module";
import { EventsModule } from "../events/events.module";
import { PublicPortalController } from "./public-portal.controller";
import { PublicPortalService } from "./public-portal.service";
import { YoutubeStreamsController, YoutubeStreamsService } from "./youtube-streams.controller";

@Module({
  imports: [PilotModule, CmsModule, EventsModule],
  controllers: [PublicPortalController, YoutubeStreamsController],
  providers: [PublicPortalService, YoutubeStreamsService],
})
export class PublicPortalModule {}
