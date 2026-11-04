import { Module } from "@nestjs/common";
import { AdmissionsModule } from "./admissions/admissions.module";
import { AuthModule } from "./auth/auth.module";
import { CredentialsModule } from "./credentials/credentials.module";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";
import { HouseholdsModule } from "./households/households.module";
import { MembershipsModule } from "./memberships/memberships.module";
import { PersonsModule } from "./persons/persons.module";
import { PilotModule } from "./pilot/pilot.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    PrismaModule,
    PilotModule,
    AuthModule,
    MembershipsModule,
    CredentialsModule,
    AdmissionsModule,
    PersonsModule,
    HouseholdsModule,
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}
