import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { CmsService } from "./cms.service";

class CreateCmsBody {
  @IsIn(["HOME_BLOCK", "PAGE", "NEWS", "BANNER", "MINISTRY_CONTENT"])
  kind!: "HOME_BLOCK" | "PAGE" | "NEWS" | "BANNER" | "MINISTRY_CONTENT";

  @IsString()
  @MinLength(1)
  slug!: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  summary?: string | null;

  @IsOptional()
  @IsString()
  body?: string | null;

  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  ministryId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

class PatchCmsBody {
  @IsOptional()
  @IsIn(["HOME_BLOCK", "PAGE", "NEWS", "BANNER", "MINISTRY_CONTENT"])
  kind?: "HOME_BLOCK" | "PAGE" | "NEWS" | "BANNER" | "MINISTRY_CONTENT";

  @IsOptional()
  @IsString()
  @MinLength(1)
  slug?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  summary?: string | null;

  @IsOptional()
  @IsString()
  body?: string | null;

  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  ministryId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsIn(["RASCUNHO", "REVISAO", "APROVADO", "PUBLICADO", "ARQUIVADO"])
  status?: "RASCUNHO" | "REVISAO" | "APROVADO" | "PUBLICADO" | "ARQUIVADO";

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsBoolean()
  notifyOnPublish?: boolean;

  @IsOptional()
  @IsArray()
  @IsIn(["WHATSAPP", "EMAIL", "PUSH"], { each: true })
  notifyChannels?: ("WHATSAPP" | "EMAIL" | "PUSH")[];

  @IsOptional()
  @IsString()
  notifyToAddress?: string | null;

  @IsOptional()
  @IsString()
  notifyPersonId?: string | null;
}

class AdvanceCmsBody {
  @IsIn(["RASCUNHO", "REVISAO", "APROVADO", "PUBLICADO", "ARQUIVADO"])
  toStatus!: "RASCUNHO" | "REVISAO" | "APROVADO" | "PUBLICADO" | "ARQUIVADO";

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsBoolean()
  notifyOnPublish?: boolean;

  @IsOptional()
  @IsArray()
  @IsIn(["WHATSAPP", "EMAIL", "PUSH"], { each: true })
  notifyChannels?: ("WHATSAPP" | "EMAIL" | "PUSH")[];

  @IsOptional()
  @IsString()
  notifyToAddress?: string | null;

  @IsOptional()
  @IsString()
  notifyPersonId?: string | null;
}

@Controller("cms/contents")
export class CmsController {
  constructor(private readonly cms: CmsService) {}

  @Roles(
    ROLE_CODES.EDITOR_SITE,
    ROLE_CODES.PUBLICADOR_SITE,
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateCmsBody) {
    return this.cms.create(user, body);
  }

  @Roles(
    ROLE_CODES.EDITOR_SITE,
    ROLE_CODES.PUBLICADOR_SITE,
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Get()
  list(@CurrentUser() user: AuthUser, @Query("kind") kind?: string) {
    return this.cms.list(user, kind);
  }

  @Roles(
    ROLE_CODES.EDITOR_SITE,
    ROLE_CODES.PUBLICADOR_SITE,
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Get(":contentId")
  get(@CurrentUser() user: AuthUser, @Param("contentId") contentId: string) {
    return this.cms.get(user, contentId);
  }

  @Roles(
    ROLE_CODES.EDITOR_SITE,
    ROLE_CODES.PUBLICADOR_SITE,
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Patch(":contentId")
  patch(
    @CurrentUser() user: AuthUser,
    @Param("contentId") contentId: string,
    @Body() body: PatchCmsBody,
  ) {
    return this.cms.patch(user, contentId, body);
  }

  @Roles(
    ROLE_CODES.EDITOR_SITE,
    ROLE_CODES.PUBLICADOR_SITE,
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Post(":contentId/advance")
  advance(
    @CurrentUser() user: AuthUser,
    @Param("contentId") contentId: string,
    @Body() body: AdvanceCmsBody,
  ) {
    return this.cms.patch(user, contentId, {
      status: body.toStatus,
      note: body.note,
      notifyOnPublish: body.notifyOnPublish,
      notifyChannels: body.notifyChannels,
      notifyToAddress: body.notifyToAddress,
      notifyPersonId: body.notifyPersonId,
    });
  }
}
