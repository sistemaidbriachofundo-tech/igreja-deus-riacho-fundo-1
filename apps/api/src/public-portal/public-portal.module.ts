import { Module } from "@nestjs/common";
import { PilotModule } from "../pilot/pilot.module";
import { PublicPortalController } from "./public-portal.controller";
import { PublicPortalService } from "./public-portal.service";

@Module({
  imports: [PilotModule],
  controllers: [PublicPortalController],
  providers: [PublicPortalService],
})
export class PublicPortalModule {}
