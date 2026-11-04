import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import {
  IsBoolean,
  IsOptional,
  IsString,
  ValidateIf,
} from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { PersonsService } from "./persons.service";

class PatchPersonBody {
  @IsOptional()
  @IsBoolean()
  isMinor?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  legalGuardianPersonId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  householdId?: string | null;
}

@Controller("persons")
export class PersonsController {
  constructor(private readonly persons: PersonsService) {}

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Get("search")
  search(
    @CurrentUser() user: AuthUser,
    @Query("q") q = "",
    @Query("limit") limit?: string,
  ) {
    return this.persons.search(user, q, limit ? Number(limit) : 10);
  }

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.PLATFORM_ADMIN,
    ROLE_CODES.MEMBRO,
  )
  @Get(":personId/dossier")
  dossier(@CurrentUser() user: AuthUser, @Param("personId") personId: string) {
    return this.persons.getDossier(user, personId);
  }

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.PLATFORM_ADMIN,
    ROLE_CODES.MEMBRO,
  )
  @Get(":personId")
  get(@CurrentUser() user: AuthUser, @Param("personId") personId: string) {
    return this.persons.getById(user, personId);
  }

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Patch(":personId")
  patch(
    @CurrentUser() user: AuthUser,
    @Param("personId") personId: string,
    @Body() body: PatchPersonBody,
  ) {
    return this.persons.patch(user, personId, body);
  }
}
