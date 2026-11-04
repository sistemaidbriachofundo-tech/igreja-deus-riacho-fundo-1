import { Controller, Get, Param, Query } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { PersonsService } from "./persons.service";

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
  )
  @Get(":personId")
  get(@CurrentUser() user: AuthUser, @Param("personId") personId: string) {
    return this.persons.getById(user, personId);
  }
}
