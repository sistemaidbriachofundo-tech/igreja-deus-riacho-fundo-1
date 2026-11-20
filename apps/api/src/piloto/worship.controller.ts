import { Body, Controller, Get, Header, Param, Patch, Post, Put } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { WorshipService } from "./worship.service";

class VocalBody {
  @IsString() classification!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(8) @IsString({ each: true }) functions!: string[];
}

class RepertoireItemBody {
  @IsString() @MinLength(1) @MaxLength(160) title!: string;
  @IsString() @MinLength(1) @MaxLength(16) musicalKey!: string;
  @IsOptional() @IsString() @MaxLength(280) materials?: string | null;
}

class RepertoireItemsBody {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(40) @ValidateNested({ each: true }) @Type(() => RepertoireItemBody)
  items!: RepertoireItemBody[];
}

class ScheduleBody {
  @IsOptional() @IsString() scheduledAt?: string | null;
}

class RepertoireBody {
  @IsOptional() @IsString() rosterId?: string | null;
  @IsString() serviceAt!: string;
  @IsString() @MinLength(8) @MaxLength(80) idempotencyKey!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(40) @ValidateNested({ each: true }) @Type(() => RepertoireItemBody)
  items!: RepertoireItemBody[];
}

@Controller("worship")
@Roles(ROLE_CODES.LIDER_MINISTERIO, ROLE_CODES.PASTOR, ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
export class WorshipController {
  constructor(private readonly worship: WorshipService) {}

  @Put("vocal-profiles/:personId")
  vocal(@CurrentUser() actor: AuthUser, @Param("personId") personId: string, @Body() body: VocalBody) {
    return this.worship.saveVocalProfile(actor, personId, body);
  }

  @Get("vocal-profiles/:personId")
  @Header("Cache-Control", "private, no-store")
  readVocal(@CurrentUser() actor: AuthUser, @Param("personId") personId: string) {
    return this.worship.vocalProfile(actor, personId);
  }

  @Get("rosters/:rosterId/export")
  @Header("Cache-Control", "private, no-store")
  exportRoster(@CurrentUser() actor: AuthUser, @Param("rosterId") rosterId: string) {
    return this.worship.exportRoster(actor, rosterId);
  }

  @Post("repertoires")
  create(@CurrentUser() actor: AuthUser, @Body() body: RepertoireBody) {
    return this.worship.createRepertoire(actor, body);
  }

  @Get("rosters/:rosterId/repertoire")
  @Header("Cache-Control", "private, no-store")
  rosterRepertoire(@CurrentUser() actor: AuthUser, @Param("rosterId") rosterId: string) {
    return this.worship.repertoireForRoster(actor, rosterId);
  }

  @Get("assignments/:assignmentId/repertoire")
  @Header("Cache-Control", "private, no-store")
  assignmentRepertoire(@CurrentUser() actor: AuthUser, @Param("assignmentId") assignmentId: string) {
    return this.worship.repertoireForAssignment(actor, assignmentId);
  }

  @Patch("repertoires/:repertoireId")
  update(@CurrentUser() actor: AuthUser, @Param("repertoireId") repertoireId: string, @Body() body: RepertoireItemsBody) {
    return this.worship.updateDraft(actor, repertoireId, body);
  }

  @Post("repertoires/:repertoireId/authorize")
  authorize(@CurrentUser() actor: AuthUser, @Param("repertoireId") repertoireId: string) {
    return this.worship.authorize(actor, repertoireId);
  }

  @Post("repertoires/:repertoireId/schedule")
  schedule(@CurrentUser() actor: AuthUser, @Param("repertoireId") repertoireId: string, @Body() body: ScheduleBody) {
    return this.worship.schedule(actor, repertoireId, body);
  }
}
