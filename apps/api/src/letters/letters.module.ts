import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PilotModule } from "../pilot/pilot.module";
import { LettersController } from "./letters.controller";
import { LettersService } from "./letters.service";

@Module({
  imports: [AuthModule, PilotModule],
  controllers: [LettersController],
  providers: [LettersService],
})
export class LettersModule {}
