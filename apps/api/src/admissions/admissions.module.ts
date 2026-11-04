import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PilotModule } from "../pilot/pilot.module";
import { AdmissionsController } from "./admissions.controller";
import { AdmissionsService } from "./admissions.service";

@Module({
  imports: [AuthModule, PilotModule],
  controllers: [AdmissionsController],
  providers: [AdmissionsService],
  exports: [AdmissionsService],
})
export class AdmissionsModule {}
