import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PilotModule } from "../pilot/pilot.module";
import { AuditAppendOnlyGuard } from "./audit-append-only";
import { AuditController } from "./audit.controller";
import { AuditService } from "./audit.service";
import { AuditWriterService } from "./audit-writer.service";

@Module({
  imports: [AuthModule, PilotModule],
  controllers: [AuditController],
  providers: [AuditService, AuditWriterService, AuditAppendOnlyGuard],
  exports: [AuditWriterService],
})
export class AuditModule {}
