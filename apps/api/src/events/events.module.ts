import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FinanceModule } from "../finance/finance.module";
import { PilotModule } from "../pilot/pilot.module";
import { ReportsModule } from "../reports/reports.module";
import { EventChurchPaymentService } from "./event-church-payment.service";
import { EventRegistrationsService } from "./event-registrations.service";
import {
  EventPaymentWebhookController,
  EventsController,
  RegistrationsController,
} from "./events.controller";
import { MemberEventsController } from "./member-events.controller";
import { EventsService } from "./events.service";

@Module({
  imports: [AuthModule, PilotModule, FinanceModule, ReportsModule],
  controllers: [
    EventsController,
    RegistrationsController,
    MemberEventsController,
    EventPaymentWebhookController,
  ],
  providers: [EventsService, EventRegistrationsService, EventChurchPaymentService],
  exports: [EventsService, EventRegistrationsService, EventChurchPaymentService],
})
export class EventsModule {}
