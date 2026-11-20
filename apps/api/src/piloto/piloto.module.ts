import { Module } from "@nestjs/common";
import { AccessScopesController } from "./access-scopes.controller";
import { AccessScopesService } from "./access-scopes.service";
import { BirthdayNoticesController } from "./birthday-notices.controller";
import { BirthdayNoticesService } from "./birthday-notices.service";
import { MercadoPagoController } from "./mercado-pago.controller";
import { MercadoPagoService } from "./mercado-pago.service";
import { ParticipantScanController } from "./participant-scan.controller";
import { ParticipantScanService } from "./participant-scan.service";
import { PastoralPackController } from "./pastoral-pack.controller";
import { PastoralPackService } from "./pastoral-pack.service";
import { SystemSettingsController } from "./system-settings.controller";
import { SystemSettingsService } from "./system-settings.service";
import { WorshipController } from "./worship.controller";
import { WorshipService } from "./worship.service";

@Module({
  controllers: [
    SystemSettingsController,
    PastoralPackController,
    BirthdayNoticesController,
    WorshipController,
    MercadoPagoController,
    ParticipantScanController,
    AccessScopesController,
  ],
  providers: [
    SystemSettingsService,
    PastoralPackService,
    BirthdayNoticesService,
    WorshipService,
    MercadoPagoService,
    ParticipantScanService,
    AccessScopesService,
  ],
})
export class PilotoModule {}
