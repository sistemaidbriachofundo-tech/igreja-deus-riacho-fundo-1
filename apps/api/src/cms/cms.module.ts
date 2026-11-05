import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PilotModule } from "../pilot/pilot.module";
import { CmsController } from "./cms.controller";
import { CmsService } from "./cms.service";

@Module({
  imports: [AuthModule, PilotModule],
  controllers: [CmsController],
  providers: [CmsService],
  exports: [CmsService],
})
export class CmsModule {}
