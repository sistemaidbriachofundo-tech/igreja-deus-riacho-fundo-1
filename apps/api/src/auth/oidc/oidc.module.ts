import { Module } from "@nestjs/common";
import { PilotModule } from "../../pilot/pilot.module";
import { OidcController } from "./oidc.controller";
import { OidcService } from "./oidc.service";

@Module({
  imports: [PilotModule],
  controllers: [OidcController],
  providers: [OidcService],
  exports: [OidcService],
})
export class OidcModule {}
