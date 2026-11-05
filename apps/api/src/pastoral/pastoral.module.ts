import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PilotModule } from "../pilot/pilot.module";
import { PastoralController } from "./pastoral.controller";
import { PastoralService } from "./pastoral.service";

@Module({
  imports: [AuthModule, PilotModule],
  controllers: [PastoralController],
  providers: [PastoralService],
})
export class PastoralModule {}
