import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { IsIn, IsOptional, IsString, MinLength } from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { LettersService } from "./letters.service";

class CreateLetterBody {
  @IsString()
  @MinLength(1)
  personId!: string;

  @IsIn(["TRANSFERENCIA", "RECOMENDACAO", "MEMBRESIA", "OUTRO"])
  letterType!: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  bodyText!: string;
}

@Controller("letters")
export class LettersController {
  constructor(private readonly letters: LettersService) {}

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Get()
  list(@CurrentUser() user: AuthUser, @Query("personId") personId?: string) {
    return this.letters.list(user, personId);
  }

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateLetterBody) {
    return this.letters.create(user, body);
  }

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Post(":letterId/issue")
  issue(@CurrentUser() user: AuthUser, @Param("letterId") letterId: string) {
    return this.letters.issue(user, letterId);
  }

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Post(":letterId/revoke")
  revoke(@CurrentUser() user: AuthUser, @Param("letterId") letterId: string) {
    return this.letters.revoke(user, letterId);
  }
}
