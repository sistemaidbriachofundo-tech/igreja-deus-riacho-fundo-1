import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from "@nestjs/common";
import { AdmissionsModule } from "./admissions/admissions.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { CredentialsModule } from "./credentials/credentials.module";
import { SimpleRateLimitMiddleware } from "./common/simple-rate-limit.middleware";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";
import { HouseholdsModule } from "./households/households.module";
import { MembershipsModule } from "./memberships/memberships.module";
import { MetaController } from "./meta/meta.controller";
import { PersonsModule } from "./persons/persons.module";
import { PilotModule } from "./pilot/pilot.module";
import { PrismaModule } from "./prisma/prisma.module";
import { StorageModule } from "./storage/storage.module";

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    PilotModule,
    AuthModule,
    MembershipsModule,
    CredentialsModule,
    AdmissionsModule,
    PersonsModule,
    HouseholdsModule,
    AuditModule,
  ],
  controllers: [HealthController, MetaController],
  providers: [HealthService, SimpleRateLimitMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SimpleRateLimitMiddleware).forRoutes(
      { path: "auth/login", method: RequestMethod.POST },
      { path: "credentials/verify/:opaqueToken", method: RequestMethod.GET },
    );
  }
}
