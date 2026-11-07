import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { GroupsService } from "./groups.service";

class CreateGroupBody {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  leaderPersonId?: string;

  @IsOptional()
  @IsString()
  meetsAtHint?: string;
}

class AddMemberBody {
  @IsString()
  @MinLength(1)
  personId!: string;

  @IsOptional()
  @IsString()
  @IsIn(["LEADER", "MEMBER"])
  role?: string;
}

class AttendanceItem {
  @IsString()
  @MinLength(1)
  personId!: string;

  @IsOptional()
  @IsBoolean()
  present?: boolean;
}

class CreateMeetingBody {
  @IsString()
  @MinLength(1)
  occurredAt!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendanceItem)
  attendance?: AttendanceItem[];
}

@Controller("small-groups")
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateGroupBody) {
    return this.groups.create(user, body);
  }

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.groups.list(user);
  }

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Get("frequency-report")
  frequencyReport(
    @CurrentUser() user: AuthUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("groupId") groupId?: string,
  ) {
    return this.groups.frequencyReport(user, { from, to, groupId });
  }

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Post(":groupId/members")
  addMember(
    @CurrentUser() user: AuthUser,
    @Param("groupId") groupId: string,
    @Body() body: AddMemberBody,
  ) {
    return this.groups.addMember(user, groupId, body);
  }

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Post(":groupId/meetings")
  createMeeting(
    @CurrentUser() user: AuthUser,
    @Param("groupId") groupId: string,
    @Body() body: CreateMeetingBody,
  ) {
    return this.groups.createMeeting(user, groupId, body);
  }
}
