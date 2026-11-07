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
const PUSH_PLATFORM_ENUM = ["ANDROID", "IOS", "WEB"] as const;

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

class RegisterDeviceTokenBody {
  @IsString()
  @MinLength(8)
  token!: string;

  @IsIn(PUSH_PLATFORM_ENUM)
  platform!: (typeof PUSH_PLATFORM_ENUM)[number];

  @IsOptional()
  @IsString()
  personId?: string | null;

  @IsOptional()
  @IsString()
  deviceLabel?: string | null;

  @IsOptional()
  @IsString()
  appId?: string | null;
}

class EnqueueOutboxBody {
  @IsIn(CHANNEL_ENUM)
  channel!: (typeof CHANNEL_ENUM)[number];

  @IsOptional()
  @IsString()
  toAddress?: string | null;

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

class PushFanoutBody {
  @IsString()
  @MinLength(1)
  personId!: string;

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

/** Self (MEMBRO) + staff — registry de device tokens / consent próprio. */
const MEMBER_OR_ADMIN_ROLES = [
  ROLE_CODES.MEMBRO,
  ROLE_CODES.SECRETARIA,
  ROLE_CODES.PASTOR,
  ROLE_CODES.LIDER_MINISTERIO,
  ROLE_CODES.TESOURARIA,
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

  @Roles(...MEMBER_OR_ADMIN_ROLES)
  @Get("consents/me")
  getMyConsent(@CurrentUser() user: AuthUser) {
    return this.channels.getConsent(user, user.personId);
  }

  @Roles(...MEMBER_OR_ADMIN_ROLES)
  @Put("consents/me")
  upsertMyConsent(
    @CurrentUser() user: AuthUser,
    @Body() body: UpsertConsentBody,
  ) {
    return this.channels.upsertConsent(user, user.personId, body);
  }

  @Roles(...MEMBER_OR_ADMIN_ROLES)
  @Get("consents/:personId")
  getConsent(
    @CurrentUser() user: AuthUser,
    @Param("personId") personId: string,
  ) {
    return this.channels.getConsent(user, personId);
  }

  @Roles(...MEMBER_OR_ADMIN_ROLES)
  @Put("consents/:personId")
  upsertConsent(
    @CurrentUser() user: AuthUser,
    @Param("personId") personId: string,
    @Body() body: UpsertConsentBody,
  ) {
    return this.channels.upsertConsent(user, personId, body);
  }

  @Roles(...MEMBER_OR_ADMIN_ROLES)
  @Post("device-tokens")
  registerDeviceToken(
    @CurrentUser() user: AuthUser,
    @Body() body: RegisterDeviceTokenBody,
  ) {
    return this.channels.registerDeviceToken(user, body);
  }

  @Roles(...MEMBER_OR_ADMIN_ROLES)
  @Get("device-tokens")
  listDeviceTokens(
    @CurrentUser() user: AuthUser,
    @Query("personId") personId?: string,
    @Query("includeRevoked") includeRevoked?: string,
  ) {
    return this.channels.listDeviceTokens(user, {
      personId,
      includeRevoked:
        includeRevoked === "1" || includeRevoked === "true",
    });
  }

  @Roles(...MEMBER_OR_ADMIN_ROLES)
  @Post("device-tokens/:tokenId/revoke")
  revokeDeviceToken(
    @CurrentUser() user: AuthUser,
    @Param("tokenId") tokenId: string,
  ) {
    return this.channels.revokeDeviceToken(user, tokenId);
  }

  @Roles(...ADMIN_ROLES)
  @Post("outbox")
  enqueue(@CurrentUser() user: AuthUser, @Body() body: EnqueueOutboxBody) {
    return this.channels.enqueue(user, body);
  }

  @Roles(...ADMIN_ROLES)
  @Post("outbox/push-fanout")
  enqueuePushFanout(
    @CurrentUser() user: AuthUser,
    @Body() body: PushFanoutBody,
  ) {
    return this.channels.enqueuePushFanout(user, body);
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
