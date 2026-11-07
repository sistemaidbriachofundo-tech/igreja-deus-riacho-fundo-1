import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { ChannelsService } from "./channels.service";

const CHANNEL_ENUM = ["WHATSAPP", "EMAIL", "PUSH"] as const;

class CreateTemplateBody {
  @IsIn(CHANNEL_ENUM)
  channel!: (typeof CHANNEL_ENUM)[number];

  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  subject?: string | null;

  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsString()
  providerTemplateName?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

class PatchTemplateBody {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  subject?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  body?: string;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsString()
  providerTemplateName?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

class UpsertConsentBody {
  @IsOptional()
  @IsBoolean()
  whatsappOptIn?: boolean;

  @IsOptional()
  @IsBoolean()
  emailOptIn?: boolean;

  @IsOptional()
  @IsBoolean()
  pushOptIn?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  purposes?: string[];

  @IsOptional()
  @IsString()
  source?: string | null;

  @IsOptional()
  @IsBoolean()
  revoke?: boolean;
}

class EnqueueOutboxBody {
  @IsIn(CHANNEL_ENUM)
  channel!: (typeof CHANNEL_ENUM)[number];

  @IsString()
  @MinLength(1)
  toAddress!: string;

  @IsOptional()
  @IsString()
  personId?: string | null;

  @IsOptional()
  @IsString()
  templateCode?: string | null;

  @IsOptional()
  @IsString()
  subject?: string | null;

  @IsOptional()
  @IsString()
  body?: string | null;

  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  sourceType?: string | null;

  @IsOptional()
  @IsString()
  sourceId?: string | null;

  @IsOptional()
  @IsBoolean()
  skipConsentCheck?: boolean;

  @IsOptional()
  @IsString()
  scheduledAt?: string | null;
}

class DispatchPendingBody {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

class ResendOutboxBody {
  @IsString()
  @MinLength(1)
  sourceType!: string;

  @IsString()
  @MinLength(1)
  sourceId!: string;

  @IsOptional()
  @IsIn(["WHATSAPP", "EMAIL", "PUSH"])
  channel?: "WHATSAPP" | "EMAIL" | "PUSH";
}

const ADMIN_ROLES = [
  ROLE_CODES.SECRETARIA,
  ROLE_CODES.PASTOR,
  ROLE_CODES.PLATFORM_ADMIN,
] as const;

@Controller("channels")
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Roles(...ADMIN_ROLES)
  @Get("providers")
  providers() {
    return this.channels.providerModes();
  }

  @Roles(...ADMIN_ROLES)
  @Get("rate-limits")
  rateLimits(@CurrentUser() user: AuthUser) {
    return this.channels.rateLimitStatus(user);
  }

  @Roles(...ADMIN_ROLES)
  @Post("templates")
  createTemplate(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateTemplateBody,
  ) {
    return this.channels.createTemplate(user, body);
  }

  @Roles(...ADMIN_ROLES)
  @Get("templates")
  listTemplates(
    @CurrentUser() user: AuthUser,
    @Query("channel") channel?: string,
  ) {
    return this.channels.listTemplates(user, channel);
  }

  @Roles(...ADMIN_ROLES)
  @Patch("templates/:templateId")
  patchTemplate(
    @CurrentUser() user: AuthUser,
    @Param("templateId") templateId: string,
    @Body() body: PatchTemplateBody,
  ) {
    return this.channels.patchTemplate(user, templateId, body);
  }

  @Roles(...ADMIN_ROLES)
  @Get("consents/:personId")
  getConsent(
    @CurrentUser() user: AuthUser,
    @Param("personId") personId: string,
  ) {
    return this.channels.getConsent(user, personId);
  }

  @Roles(...ADMIN_ROLES)
  @Put("consents/:personId")
  upsertConsent(
    @CurrentUser() user: AuthUser,
    @Param("personId") personId: string,
    @Body() body: UpsertConsentBody,
  ) {
    return this.channels.upsertConsent(user, personId, body);
  }

  @Roles(...ADMIN_ROLES)
  @Post("outbox")
  enqueue(@CurrentUser() user: AuthUser, @Body() body: EnqueueOutboxBody) {
    return this.channels.enqueue(user, body);
  }

  @Roles(...ADMIN_ROLES)
  @Get("outbox")
  listOutbox(
    @CurrentUser() user: AuthUser,
    @Query("status") status?: string,
    @Query("channel") channel?: string,
    @Query("limit") limit?: string,
  ) {
    return this.channels.listOutbox(user, {
      status,
      channel,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Roles(...ADMIN_ROLES)
  @Post("outbox/dispatch-pending")
  dispatchPending(
    @CurrentUser() user: AuthUser,
    @Body() body: DispatchPendingBody,
  ) {
    return this.channels.dispatchPending(user, body.limit);
  }

  @Roles(...ADMIN_ROLES)
  @Post("outbox/resend")
  resendOutbox(
    @CurrentUser() user: AuthUser,
    @Body() body: ResendOutboxBody,
  ) {
    return this.channels.resendOutbox(user, body);
  }

  @Roles(...ADMIN_ROLES)
  @Get("outbox/:outboxId")
  getOutbox(
    @CurrentUser() user: AuthUser,
    @Param("outboxId") outboxId: string,
  ) {
    return this.channels.getOutbox(user, outboxId);
  }

  @Roles(...ADMIN_ROLES)
  @Post("outbox/:outboxId/dispatch")
  dispatchOne(
    @CurrentUser() user: AuthUser,
    @Param("outboxId") outboxId: string,
  ) {
    return this.channels.dispatchOne(user, outboxId);
  }
}
