import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PilotModule } from "../pilot/pilot.module";
import { AdmissionDocumentsService } from "./admission-documents.service";
import { AdmissionsController } from "./admissions.controller";
import { AdmissionsService } from "./admissions.service";

@Module({
  imports: [AuthModule, PilotModule],
  controllers: [AdmissionsController],
  providers: [AdmissionsService, AdmissionDocumentsService],
  exports: [AdmissionsService],
})
export class AdmissionsModule {}
