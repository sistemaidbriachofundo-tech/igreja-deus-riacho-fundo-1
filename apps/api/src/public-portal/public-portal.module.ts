import { Module } from "@nestjs/common";
import { PilotModule } from "../pilot/pilot.module";
import { CmsModule } from "../cms/cms.module";
import { PublicPortalController } from "./public-portal.controller";
import { PublicPortalService } from "./public-portal.service";

@Module({
  imports: [PilotModule, CmsModule],
  controllers: [PublicPortalController],
  providers: [PublicPortalService],
})
export class PublicPortalModule {}
