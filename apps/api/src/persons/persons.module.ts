import { Module } from "@nestjs/common";
import { AccountModule } from "../account/account.module";
import { AuthModule } from "../auth/auth.module";
import { PilotModule } from "../pilot/pilot.module";
import { PersonsController } from "./persons.controller";
import { PersonsService } from "./persons.service";

@Module({
  imports: [AuthModule, PilotModule, AccountModule],
  controllers: [PersonsController],
  providers: [PersonsService],
})
export class PersonsModule {}
