import { Body, Controller, Get, Header, Param, Post, Query } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { PastoralPackService } from "./pastoral-pack.service";

class PrayerBody {
  @IsString() @MinLength(2) @MaxLength(2000) body!: string;
  @IsOptional() @IsString() @MaxLength(40) responsibleUserId?: string | null;
  @IsOptional() @IsString() @MaxLength(40) substituteUserId?: string | null;
}

class DossierFileBody {
  @IsString() @MinLength(1) @MaxLength(180) fileName!: string;
  @IsString() @MaxLength(120) contentType!: string;
  @IsString() @MinLength(8) contentBase64!: string;
}

@Controller()
export class PastoralPackController {
  constructor(private readonly pack: PastoralPackService) {}

  @Roles(ROLE_CODES.PASTOR, ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Get("pastoral/congregation")
  @Header("Cache-Control", "private, no-store")
  dashboard(@CurrentUser() actor: AuthUser) {
    return this.pack.dashboard(actor);
  }

  @Roles(ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN)
  @Get("pastoral/congregation/people")
  @Header("Cache-Control", "private, no-store")
  people(@CurrentUser() actor: AuthUser, @Query("q") q = "") {
    return this.pack.searchPeople(actor, q);
  }

  @Roles(ROLE_CODES.MEMBRO, ROLE_CODES.CONVIDADO, ROLE_CODES.SECRETARIA, ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN)
  @Post("pastoral/prayers")
  createPrayer(@CurrentUser() actor: AuthUser, @Body() body: PrayerBody) {
    return this.pack.createPrayer(actor, body);
  }

  @Roles(ROLE_CODES.PASTOR, ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Get("pastoral/prayers")
  @Header("Cache-Control", "private, no-store")
  listPrayers(@CurrentUser() actor: AuthUser) {
    return this.pack.listPrayers(actor);
  }

  @Roles(ROLE_CODES.PASTOR, ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Get("pastoral/prayers/bell")
  @Header("Cache-Control", "private, no-store")
  bells(@CurrentUser() actor: AuthUser) {
    return this.pack.bells(actor);
  }

  @Roles(ROLE_CODES.PASTOR, ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Post("pastoral/prayers/bell/:bellId/read")
  readBell(@CurrentUser() actor: AuthUser, @Param("bellId") bellId: string) {
    return this.pack.readBell(actor, bellId);
  }

  @Roles(ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN)
  @Post("pastoral/prayers/:requestId/close")
  close(@CurrentUser() actor: AuthUser, @Param("requestId") requestId: string) {
    return this.pack.closePrayer(actor, requestId);
  }

  @Roles(ROLE_CODES.PASTOR, ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Get("pastoral/prayers/:requestId")
  @Header("Cache-Control", "private, no-store")
  readPrayer(@CurrentUser() actor: AuthUser, @Param("requestId") requestId: string) {
    return this.pack.readPrayer(actor, requestId);
  }

  @Roles(ROLE_CODES.PASTOR, ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN, ROLE_CODES.LIDER_MINISTERIO)
  @Get("persons/:personId/associations")
  @Header("Cache-Control", "private, no-store")
  associations(@CurrentUser() actor: AuthUser, @Param("personId") personId: string) {
    return this.pack.associations(actor, personId);
  }

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN)
  @Post("persons/:personId/dossier-files")
  dossier(@CurrentUser() actor: AuthUser, @Param("personId") personId: string, @Body() body: DossierFileBody) {
    return this.pack.saveDossierFile(actor, personId, body);
  }

  @Roles(ROLE_CODES.MEMBRO, ROLE_CODES.SECRETARIA, ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN)
  @Get("reports/credential-color/:membershipId")
  @Header("Cache-Control", "private, no-store")
  color(@CurrentUser() actor: AuthUser, @Param("membershipId") membershipId: string) {
    return this.pack.credentialColor(actor, membershipId);
  }
}
