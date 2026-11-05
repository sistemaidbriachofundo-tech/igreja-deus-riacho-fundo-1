import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { VolunteersService } from "./volunteers.service";

class PublicVolunteerBody {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  displayName!: string;

  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ministrySlug?: string;
}

class AdvanceVolunteerBody {
  @IsOptional()
  @IsIn([
    "INTERESSE",
    "AVALIACAO",
    "APROVACAO",
    "EQUIPE",
    "DISPONIBILIDADE",
    "ESCALA",
  ])
  stage?:
    | "INTERESSE"
    | "AVALIACAO"
    | "APROVACAO"
    | "EQUIPE"
    | "DISPONIBILIDADE"
    | "ESCALA";

  @IsOptional()
  @IsIn(["OPEN", "REJECTED", "CLOSED"])
  status?: "OPEN" | "REJECTED" | "CLOSED";

  @IsOptional()
  @IsString()
  personId?: string | null;

  @IsOptional()
  @IsString()
  rosterId?: string | null;

  @IsOptional()
  @IsString()
  notesInternal?: string | null;
}

@Controller()
export class VolunteersController {
  constructor(private readonly volunteers: VolunteersService) {}

  @Public()
  @Post("public/volunteer-interests")
  submitPublic(@Body() body: PublicVolunteerBody) {
    return this.volunteers.submitPublicInterest(body);
  }

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Get("volunteer-interests")
  list(
    @CurrentUser() user: AuthUser,
    @Query("ministryId") ministryId?: string,
  ) {
    return this.volunteers.listAdmin(user, ministryId);
  }

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Get("volunteer-interests/:interestId")
  get(
    @CurrentUser() user: AuthUser,
    @Param("interestId") interestId: string,
  ) {
    return this.volunteers.getAdmin(user, interestId);
  }

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Patch("volunteer-interests/:interestId")
  advance(
    @CurrentUser() user: AuthUser,
    @Param("interestId") interestId: string,
    @Body() body: AdvanceVolunteerBody,
  ) {
    return this.volunteers.advance(user, interestId, body);
  }
}
