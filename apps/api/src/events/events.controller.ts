import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { EventRegistrationsService } from "./event-registrations.service";
import { EventsService } from "./events.service";

class CreateEventBody {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  slug!: string;

  @IsString()
  @MinLength(1)
  startsAt!: string;

  @IsOptional()
  @IsString()
  endsAt?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  locationText?: string | null;

  @IsOptional()
  @IsString()
  ministryId?: string | null;

  @IsOptional()
  @IsBoolean()
  featuredOnHome?: boolean;
}

class PatchEventBody {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  slug?: string;

  @IsOptional()
  @IsString()
  startsAt?: string;

  @IsOptional()
  @IsString()
  endsAt?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  locationText?: string | null;

  @IsOptional()
  @IsString()
  ministryId?: string | null;

  @IsOptional()
  @IsBoolean()
  featuredOnHome?: boolean;

  @IsOptional()
  @IsIn(["DRAFT", "PUBLISHED", "CANCELLED", "ARCHIVED"])
  status?: "DRAFT" | "PUBLISHED" | "CANCELLED" | "ARCHIVED";
}

class CreateModalityBody {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsIn(["INDIVIDUAL", "COUPLE", "FAMILY", "CUSTOM"])
  kind?: "INDIVIDUAL" | "COUPLE" | "FAMILY" | "CUSTOM";

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  minPartySize?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxPartySize?: number;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

class CreateLotBody {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  modalityId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  opensAt?: string | null;

  @IsOptional()
  @IsString()
  closesAt?: string | null;

  @IsOptional()
  @IsIn(["DRAFT", "OPEN", "CLOSED"])
  status?: "DRAFT" | "OPEN" | "CLOSED";

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

class CreateResourceOptionBody {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  kind?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number | null;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

class CreateRegistrationBody {
  @IsString()
  @MinLength(2)
  displayName!: string;

  @IsString()
  @MinLength(1)
  modalityId!: string;

  @IsOptional()
  @IsString()
  lotId?: string | null;

  @IsOptional()
  @IsString()
  lodgingOptionId?: string | null;

  @IsOptional()
  @IsString()
  mealOptionId?: string | null;

  @IsOptional()
  @IsString()
  transportOptionId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  partySize?: number;

  @IsOptional()
  @IsBoolean()
  isMinor?: boolean;

  @IsOptional()
  @IsString()
  guardianDisplayName?: string | null;

  @IsOptional()
  @IsBoolean()
  guardianAcknowledged?: boolean;
}

class CheckInBody {
  @IsOptional()
  @IsString()
  checkInCode?: string;
}

class GuardianAuthorizationBody {
  @IsIn(["AUTHORIZED", "REVOKED"])
  status!: "AUTHORIZED" | "REVOKED";

  @IsOptional()
  @IsString()
  acknowledgmentText?: string;
}

class MockPaymentWebhookBody {
  @IsString()
  @MinLength(1)
  paymentIntentId!: string;

  @IsIn(["CONFIRMED_MOCK", "FAILED_MOCK"])
  status!: "CONFIRMED_MOCK" | "FAILED_MOCK";

  @IsOptional()
  @IsString()
  providerRef?: string | null;
}

const EVENT_STAFF = [
  ROLE_CODES.SECRETARIA,
  ROLE_CODES.PASTOR,
  ROLE_CODES.LIDER_MINISTERIO,
  ROLE_CODES.PLATFORM_ADMIN,
] as const;

@Controller("events")
export class EventsController {
  constructor(
    private readonly events: EventsService,
    private readonly registrations: EventRegistrationsService,
  ) {}

  @Roles(...EVENT_STAFF)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateEventBody) {
    return this.events.create(user, body);
  }

  @Roles(...EVENT_STAFF)
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.events.list(user);
  }

  @Roles(...EVENT_STAFF)
  @Get(":eventId")
  get(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string) {
    return this.events.get(user, eventId);
  }

  @Roles(...EVENT_STAFF)
  @Patch(":eventId")
  patch(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
    @Body() body: PatchEventBody,
  ) {
    return this.events.patch(user, eventId, body);
  }

  @Roles(...EVENT_STAFF)
  @Post(":eventId/publish")
  publish(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string) {
    return this.events.publish(user, eventId);
  }

  @Roles(...EVENT_STAFF)
  @Post(":eventId/cancel")
  cancel(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string) {
    return this.events.cancel(user, eventId);
  }

  @Roles(...EVENT_STAFF)
  @Post(":eventId/archive")
  archive(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string) {
    return this.events.archive(user, eventId);
  }

  @Roles(...EVENT_STAFF)
  @Post(":eventId/modalities")
  createModality(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
    @Body() body: CreateModalityBody,
  ) {
    return this.registrations.createModality(user, eventId, body);
  }

  @Roles(...EVENT_STAFF)
  @Get(":eventId/modalities")
  listModalities(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
  ) {
    return this.registrations.listModalities(user, eventId);
  }

  @Roles(...EVENT_STAFF)
  @Post(":eventId/lots")
  createLot(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
    @Body() body: CreateLotBody,
  ) {
    return this.registrations.createLot(user, eventId, body);
  }

  @Roles(...EVENT_STAFF)
  @Get(":eventId/lots")
  listLots(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string) {
    return this.registrations.listLots(user, eventId);
  }

  @Roles(...EVENT_STAFF)
  @Post(":eventId/lodging-options")
  createLodgingOption(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
    @Body() body: CreateResourceOptionBody,
  ) {
    return this.registrations.createLodgingOption(user, eventId, {
      ...body,
      kind: body.kind as
        | "NONE"
        | "SHARED"
        | "COUPLE"
        | "FAMILY"
        | "CUSTOM"
        | undefined,
    });
  }

  @Roles(...EVENT_STAFF)
  @Get(":eventId/lodging-options")
  listLodgingOptions(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
  ) {
    return this.registrations.listLodgingOptions(user, eventId);
  }

  @Roles(...EVENT_STAFF)
  @Post(":eventId/meal-options")
  createMealOption(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
    @Body() body: CreateResourceOptionBody,
  ) {
    return this.registrations.createMealOption(user, eventId, {
      ...body,
      kind: body.kind as
        | "NONE"
        | "BREAKFAST"
        | "LUNCH"
        | "DINNER"
        | "FULL_BOARD"
        | "CUSTOM"
        | undefined,
    });
  }

  @Roles(...EVENT_STAFF)
  @Get(":eventId/meal-options")
  listMealOptions(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
  ) {
    return this.registrations.listMealOptions(user, eventId);
  }

  @Roles(...EVENT_STAFF)
  @Post(":eventId/transport-options")
  createTransportOption(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
    @Body() body: CreateResourceOptionBody,
  ) {
    return this.registrations.createTransportOption(user, eventId, {
      ...body,
      kind: body.kind as
        | "NONE"
        | "OWN"
        | "EVENT_BUS"
        | "CARPOOL"
        | "CUSTOM"
        | undefined,
    });
  }

  @Roles(...EVENT_STAFF)
  @Get(":eventId/transport-options")
  listTransportOptions(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
  ) {
    return this.registrations.listTransportOptions(user, eventId);
  }

  @Roles(...EVENT_STAFF)
  @Get(":eventId/registrations")
  listRegistrations(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
  ) {
    return this.registrations.listRegistrations(user, eventId);
  }

  @Roles(...EVENT_STAFF)
  @Post(":eventId/registrations")
  createRegistration(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
    @Body() body: CreateRegistrationBody,
  ) {
    return this.registrations.createStaffRegistration(user, eventId, body);
  }
}

@Controller("registrations")
export class RegistrationsController {
  constructor(private readonly registrations: EventRegistrationsService) {}

  @Roles(...EVENT_STAFF)
  @Post(":registrationId/check-in")
  checkIn(
    @CurrentUser() user: AuthUser,
    @Param("registrationId") registrationId: string,
    @Body() body: CheckInBody,
  ) {
    return this.registrations.checkIn(user, registrationId, body.checkInCode);
  }

  @Roles(...EVENT_STAFF)
  @Post(":registrationId/cancel")
  cancel(
    @CurrentUser() user: AuthUser,
    @Param("registrationId") registrationId: string,
  ) {
    return this.registrations.cancel(user, registrationId);
  }

  @Roles(...EVENT_STAFF)
  @Post(":registrationId/guardian-authorization")
  setGuardianAuthorization(
    @CurrentUser() user: AuthUser,
    @Param("registrationId") registrationId: string,
    @Body() body: GuardianAuthorizationBody,
  ) {
    return this.registrations.setGuardianAuthorization(
      user,
      registrationId,
      body,
    );
  }
}

@Controller("webhooks/event-payments")
export class EventPaymentWebhookController {
  constructor(private readonly registrations: EventRegistrationsService) {}

  /** Stub assinado + idempotente — status apenas PENDING→CONFIRMED_MOCK|FAILED_MOCK. */
  @Public()
  @Post("mock")
  mockConfirm(
    @Headers("x-webhook-signature") signature: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: MockPaymentWebhookBody,
  ) {
    return this.registrations.handleMockPaymentWebhook({
      signatureHeader: signature,
      idempotencyKey,
      paymentIntentId: body.paymentIntentId,
      status: body.status,
      providerRef: body.providerRef,
    });
  }
}
