import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { IsArray, IsOptional, IsString, ArrayMinSize } from "class-validator";
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

class AddMembersBody {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  memberPersonIds!: string[];
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
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.households.list(user);
  }

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Get(":householdId")
  get(@CurrentUser() user: AuthUser, @Param("householdId") householdId: string) {
    return this.households.getById(user, householdId);
  }

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Post(":householdId/members")
  addMembers(
    @CurrentUser() user: AuthUser,
    @Param("householdId") householdId: string,
    @Body() body: AddMembersBody,
  ) {
    return this.households.addMembers(user, householdId, body.memberPersonIds);
  }

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Delete(":householdId/members/:personId")
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param("householdId") householdId: string,
    @Param("personId") personId: string,
  ) {
    return this.households.removeMember(user, householdId, personId);
  }
}
