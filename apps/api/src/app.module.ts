import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { CredentialsModule } from "./credentials/credentials.module";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";
import { MembershipsModule } from "./memberships/memberships.module";
import { PilotModule } from "./pilot/pilot.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    PrismaModule,
    PilotModule,
    AuthModule,
    MembershipsModule,
    CredentialsModule,
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}
