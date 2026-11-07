import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PilotModule } from "../pilot/pilot.module";
import { ViviKnowledgeService } from "./knowledge/vivi-knowledge.service";
import { ViviController } from "./vivi.controller";
import { ViviRateLimitService } from "./vivi-rate-limit.service";
import { ViviService } from "./vivi.service";

@Module({
  imports: [AuthModule, PilotModule],
  controllers: [ViviController],
  providers: [ViviService, ViviRateLimitService, ViviKnowledgeService],
  exports: [ViviService],
})
export class ViviModule {}
