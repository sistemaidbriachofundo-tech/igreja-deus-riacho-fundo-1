import { Global, Module } from "@nestjs/common";
import { PilotService } from "./pilot.service";

@Global()
@Module({
  providers: [PilotService],
  exports: [PilotService],
})
export class PilotModule {}
