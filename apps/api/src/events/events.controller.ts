import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
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

@Controller("events")
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateEventBody) {
    return this.events.create(user, body);
  }

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.events.list(user);
  }

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Get(":eventId")
  get(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string) {
    return this.events.get(user, eventId);
  }

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Patch(":eventId")
  patch(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
    @Body() body: PatchEventBody,
  ) {
    return this.events.patch(user, eventId, body);
  }

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Post(":eventId/publish")
  publish(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string) {
    return this.events.publish(user, eventId);
  }

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Post(":eventId/cancel")
  cancel(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string) {
    return this.events.cancel(user, eventId);
  }

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Post(":eventId/archive")
  archive(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string) {
    return this.events.archive(user, eventId);
  }
}
