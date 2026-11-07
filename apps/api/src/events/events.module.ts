import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PilotModule } from "../pilot/pilot.module";
import { EventRegistrationsService } from "./event-registrations.service";
import {
  EventPaymentWebhookController,
  EventsController,
  RegistrationsController,
} from "./events.controller";
import { EventsService } from "./events.service";

@Module({
  imports: [AuthModule, PilotModule],
  controllers: [
    EventsController,
    RegistrationsController,
    EventPaymentWebhookController,
  ],
  providers: [EventsService, EventRegistrationsService],
  exports: [EventsService, EventRegistrationsService],
})
export class EventsModule {}
