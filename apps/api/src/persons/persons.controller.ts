import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";
import { Type } from "class-transformer";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { PersonsService } from "./persons.service";

export class PatchPersonBody {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  displayName?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @IsOptional()
  @IsBoolean()
  isMinor?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MinLength(1)
  legalGuardianPersonId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MinLength(1)
  householdId?: string | null;

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;

  /** Recusado no service: inativação não tem fluxo regulado. */
  @IsOptional()
  @IsString()
  status?: string;

  /** Recusado no service: tipo só muda na aprovação pastoral. */
  @IsOptional()
  @IsString()
  kind?: string;
}

class PersonCandidatesBody {
  @IsString()
  @MinLength(2)
  displayName!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
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

  /**
   * Pré-checagem de duplicidade (RF-001). Sempre autoMergeForbidden=true.
   * Rota estática antes de :personId.
   */
  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Post("candidates")
  candidates(
    @CurrentUser() user: AuthUser,
    @Body() body: PersonCandidatesBody,
  ) {
    return this.persons.findCandidates(user, body);
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
