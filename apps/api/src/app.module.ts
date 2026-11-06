import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from "@nestjs/common";
import { AdmissionsModule } from "./admissions/admissions.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { MfaModule } from "./auth/mfa/mfa.module";
import { OidcModule } from "./auth/oidc/oidc.module";
import { CredentialsModule } from "./credentials/credentials.module";
import { SimpleRateLimitMiddleware } from "./common/simple-rate-limit.middleware";
import { ChannelsModule } from "./channels/channels.module";
import { ChurchesModule } from "./churches/churches.module";
import { CmsModule } from "./cms/cms.module";
import { DiscipleshipModule } from "./discipleship/discipleship.module";
import { EventsModule } from "./events/events.module";
import { FinanceModule } from "./finance/finance.module";
import { GroupsModule } from "./groups/groups.module";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";
import { HouseholdsModule } from "./households/households.module";
import { IndicatorsModule } from "./indicators/indicators.module";
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
import { VolunteersModule } from "./volunteers/volunteers.module";

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    PilotModule,
    AuthModule,
    MfaModule,
    OidcModule,
    ChurchesModule,
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
    FinanceModule,
    ChannelsModule,
    IndicatorsModule,
    CmsModule,
    VolunteersModule,
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
      { path: "public/volunteer-interests", method: RequestMethod.POST },
    );
  }
}
