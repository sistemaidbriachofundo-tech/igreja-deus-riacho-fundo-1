import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { IsArray, IsOptional, IsString } from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { HouseholdsService } from "./households.service";

class CreateHouseholdBody {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  memberPersonIds?: string[];
}

@Controller("households")
export class HouseholdsController {
  constructor(private readonly households: HouseholdsService) {}

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateHouseholdBody) {
    return this.households.create(user, body);
  }

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Get(":householdId")
  get(@CurrentUser() user: AuthUser, @Param("householdId") householdId: string) {
    return this.households.getById(user, householdId);
  }
}
