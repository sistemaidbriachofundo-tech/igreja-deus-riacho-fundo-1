import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from "@nestjs/common";
import { AccountModule } from "./account/account.module";
import { AdmissionsModule } from "./admissions/admissions.module";
import { AssetsModule } from "./assets/assets.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { MfaModule } from "./auth/mfa/mfa.module";
import { OidcModule } from "./auth/oidc/oidc.module";
import { CredentialsModule } from "./credentials/credentials.module";
import { SimpleRateLimitMiddleware } from "./common/simple-rate-limit.middleware";
import { CorrelationMiddleware } from "./common/observability/correlation.middleware";
import { ObservabilityModule } from "./common/observability/observability.module";
import { ALL_ROUTES } from "./common/observability/wiring";
import { ChannelsModule } from "./channels/channels.module";
import { ChurchesModule } from "./churches/churches.module";
import { CmsModule } from "./cms/cms.module";
import { CoursesModule } from "./courses/courses.module";
import { DiscipleshipModule } from "./discipleship/discipleship.module";
import { EventsModule } from "./events/events.module";
import { FinanceModule } from "./finance/finance.module";
import { TreasuryModule } from "./treasury/treasury.module";
import { GroupsModule } from "./groups/groups.module";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";
import { HouseholdsModule } from "./households/households.module";
import { IndicatorsModule } from "./indicators/indicators.module";
import { LettersModule } from "./letters/letters.module";
import { MailModule } from "./mail/mail.module";
import { MembershipsModule } from "./memberships/memberships.module";
import { MetaController } from "./meta/meta.controller";
import { MinistriesModule } from "./ministries/ministries.module";
import { PersonalRostersModule } from "./rosters/personal-rosters.module";
import { PastoralModule } from "./pastoral/pastoral.module";
import { PersonsModule } from "./persons/persons.module";
import { PilotModule } from "./pilot/pilot.module";
import { PlatformSecurityModule } from "./platform-security/platform-security.module";
import { PrismaModule } from "./prisma/prisma.module";
import { PublicPortalModule } from "./public-portal/public-portal.module";
import { ReportsModule } from "./reports/reports.module";
import { StorageModule } from "./storage/storage.module";
import { TransfersModule } from "./transfers/transfers.module";
import { VolunteersModule } from "./volunteers/volunteers.module";
import { ViviModule } from "./vivi/vivi.module";

@Module({
  imports: [
    PrismaModule,
    MailModule,
    PlatformSecurityModule,
    ObservabilityModule.forRoot({ env: observabilityEnv() }),
    StorageModule,
    PilotModule,
    AuthModule,
    AccountModule,
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
    CoursesModule,
    GroupsModule,
    MinistriesModule,
    PersonalRostersModule,
    EventsModule,
    FinanceModule,
    TreasuryModule,
    ChannelsModule,
    IndicatorsModule,
    ReportsModule,
    AssetsModule,
    CmsModule,
    VolunteersModule,
    PublicPortalModule,
    AuditModule,
    ViviModule,
  ],
  controllers: [HealthController, MetaController],
  providers: [HealthService, SimpleRateLimitMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    if (observabilityInstalled()) {
      consumer.apply(CorrelationMiddleware).forRoutes(ALL_ROUTES);
    }
    consumer.apply(SimpleRateLimitMiddleware).forRoutes(
      { path: "auth/login", method: RequestMethod.POST },
      { path: "auth/activate-invite", method: RequestMethod.POST },
      { path: "auth/reset-password", method: RequestMethod.POST },
      { path: "credentials/verify/:opaqueToken", method: RequestMethod.GET },
      { path: "public/volunteer-interests", method: RequestMethod.POST },
      { path: "public/events/:slug/registrations", method: RequestMethod.POST },
      { path: "member-events/:slug/registrations", method: RequestMethod.POST },
      { path: "webhooks/event-payments/mock", method: RequestMethod.POST },
      // Camada extra além do ViviRateLimitService (IP + path)
      { path: "public/vivi/chat", method: RequestMethod.POST },
    );
  }
}

function observabilityInstalled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.OBSERVABILITY_INSTALL_GLOBALS === "1"
    || env.VERCEL === "1"
    || env.IDBRF_RUNTIME_STAGE === "production";
}

function observabilityEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...env,
    OBSERVABILITY_INSTALL_GLOBALS: env.OBSERVABILITY_INSTALL_GLOBALS ?? (observabilityInstalled(env) ? "1" : "0"),
    OBSERVABILITY_WIRE_MIDDLEWARE: "0",
  };
}
