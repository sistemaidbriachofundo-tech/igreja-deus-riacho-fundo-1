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
import { DiscipleshipModule } from "./discipleship/discipleship.module";
import { EventsModule } from "./events/events.module";
import { GroupsModule } from "./groups/groups.module";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";
import { HouseholdsModule } from "./households/households.module";
import { LettersModule } from "./letters/letters.module";
import { MembershipsModule } from "./memberships/memberships.module";
import { MetaController } from "./meta/meta.controller";
import { MinistriesModule } from "./ministries/ministries.module";
import { PastoralModule } from "./pastoral/pastoral.module";
import { PersonsModule } from "./persons/persons.module";
import { PilotModule } from "./pilot/pilot.module";
import { PrismaModule } from "./prisma/prisma.module";
import { PublicPortalModule } from "./public-portal/public-portal.module";
import { StorageModule } from "./storage/storage.module";
import { TransfersModule } from "./transfers/transfers.module";

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
    TransfersModule,
    LettersModule,
    PastoralModule,
    DiscipleshipModule,
    GroupsModule,
    MinistriesModule,
    EventsModule,
    PublicPortalModule,
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
