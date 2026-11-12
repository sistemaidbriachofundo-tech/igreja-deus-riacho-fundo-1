import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsISO8601,
  Matches,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import {
  MembershipsService,
  type RegisterMembershipInput,
} from "./memberships.service";

class RegisterMembershipBody implements RegisterMembershipInput {
  @IsString()
  @MinLength(1)
  displayName!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  householdLabel?: string;

  @IsOptional()
  @IsString()
  householdId?: string;

  @IsOptional()
  @IsString()
  personId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @Matches(/^\\d{4}-\\d{2}-\\d{2}$/)
  birthDate?: string;

  @IsOptional()
  @Matches(/^\\d{4}-\\d{2}-\\d{2}$/)
  baptismDate?: string;

  @IsOptional()
  @Matches(/^\\d{4}-\\d{2}-\\d{2}$/)
  firstAttendedOn?: string;

  @IsOptional()
  @Matches(/^\\d{4}-\\d{2}-\\d{2}$/)
  weddingDate?: string;

  @IsOptional()
  @IsIn(["MALE", "FEMALE", "OTHER"])
  sex?: "MALE" | "FEMALE" | "OTHER";

  @IsOptional()
  @IsBoolean()
  isMinor?: boolean;

  @IsOptional()
  @IsString()
  legalGuardianPersonId?: string;
}

export class PatchMembershipBody {
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(4000)
  notes?: string | null;

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;

  /** Recusado no service: situação segue admissão, transferência ou fluxo ainda inexistente. */
  @IsOptional()
  @IsString()
  status?: string;
}

/**
 * Secretaria — listagem e cadastro de membresia no piloto Riacho Fundo I.
 * Escopo validado no service (grants SECRETARIA × church piloto).
 */
@Controller("memberships")
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.memberships.listForPilot(user);
  }

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Post()
  register(
    @CurrentUser() user: AuthUser,
    @Body() body: RegisterMembershipBody,
  ) {
    return this.memberships.register(user, body);
  }

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Patch(":membershipId")
  patch(
    @CurrentUser() user: AuthUser,
    @Param("membershipId") membershipId: string,
    @Body() body: PatchMembershipBody,
  ) {
    return this.memberships.patch(user, membershipId, body);
  }
}
