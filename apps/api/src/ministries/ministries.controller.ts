import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { MinistriesService } from "./ministries.service";

class CreateMinistryBody {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  slug!: string;

  @IsOptional()
  @IsString()
  leaderPersonId?: string;
}

class LeadershipPublicBody {
  @IsString()
  @MinLength(1)
  displayName!: string;

  @IsString()
  @MinLength(1)
  roleTitle!: string;
}

class PatchMinistryBody {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  slug?: string;

  @IsOptional()
  @IsString()
  leaderPersonId?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  coverImageUrl?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  galleryUrls?: string[];

  @IsOptional()
  @IsString()
  scheduleText?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeadershipPublicBody)
  leadershipPublic?: LeadershipPublicBody[];

  @IsOptional()
  @IsString()
  participationInfo?: string | null;

  @IsOptional()
  @IsIn(["PUBLIC", "INTERNAL"])
  visibility?: "PUBLIC" | "INTERNAL";

  @IsOptional()
  @IsIn(["DRAFT", "PUBLISHED", "ARCHIVED"])
  publishStatus?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
}

class CreateRosterBody {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  serviceAt!: string;

  @IsOptional()
  @IsString()
  ministryId?: string;
}

class CreateSlotBody {
  @IsString()
  @MinLength(1)
  roleLabel!: string;

  @IsOptional()
  @IsBoolean()
  requiresCouple?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

class CreateAssignmentBody {
  @IsString()
  @MinLength(1)
  personId!: string;

  @IsOptional()
  @IsString()
  partnerPersonId?: string;
}

class SubstituteBody {
  @IsString()
  @MinLength(1)
  personId!: string;

  @IsOptional()
  @IsString()
  partnerPersonId?: string;
}

@Controller("ministries")
export class MinistriesController {
  constructor(private readonly ministries: MinistriesService) {}

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateMinistryBody) {
    return this.ministries.createMinistry(user, body);
  }

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.ministries.listMinistries(user);
  }

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Get(":ministryId")
  get(
    @CurrentUser() user: AuthUser,
    @Param("ministryId") ministryId: string,
  ) {
    return this.ministries.getMinistry(user, ministryId);
  }

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Patch(":ministryId")
  patch(
    @CurrentUser() user: AuthUser,
    @Param("ministryId") ministryId: string,
    @Body() body: PatchMinistryBody,
  ) {
    return this.ministries.patchMinistry(user, ministryId, body);
  }

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Post(":ministryId/publish")
  publish(
    @CurrentUser() user: AuthUser,
    @Param("ministryId") ministryId: string,
  ) {
    return this.ministries.publishMinistry(user, ministryId);
  }

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Post(":ministryId/archive")
  archive(
    @CurrentUser() user: AuthUser,
    @Param("ministryId") ministryId: string,
  ) {
    return this.ministries.archiveMinistry(user, ministryId);
  }
}

@Controller("rosters")
export class RostersController {
  constructor(private readonly ministries: MinistriesService) {}

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateRosterBody) {
    return this.ministries.createRoster(user, body);
  }

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.ministries.listRosters(user);
  }

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Post(":rosterId/slots")
  addSlot(
    @CurrentUser() user: AuthUser,
    @Param("rosterId") rosterId: string,
    @Body() body: CreateSlotBody,
  ) {
    return this.ministries.addSlot(user, rosterId, body);
  }
}

@Controller("slots")
export class RosterSlotsController {
  constructor(private readonly ministries: MinistriesService) {}

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Post(":slotId/assignments")
  addAssignment(
    @CurrentUser() user: AuthUser,
    @Param("slotId") slotId: string,
    @Body() body: CreateAssignmentBody,
  ) {
    return this.ministries.addAssignment(user, slotId, body);
  }
}

@Controller("assignments")
export class RosterAssignmentsController {
  constructor(private readonly ministries: MinistriesService) {}

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
    ROLE_CODES.MEMBRO,
  )
  @Post(":assignmentId/confirm")
  confirm(
    @CurrentUser() user: AuthUser,
    @Param("assignmentId") assignmentId: string,
  ) {
    return this.ministries.confirmAssignment(user, assignmentId);
  }

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
    ROLE_CODES.MEMBRO,
  )
  @Post(":assignmentId/decline")
  decline(
    @CurrentUser() user: AuthUser,
    @Param("assignmentId") assignmentId: string,
  ) {
    return this.ministries.declineAssignment(user, assignmentId);
  }

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Post(":assignmentId/substitute")
  substitute(
    @CurrentUser() user: AuthUser,
    @Param("assignmentId") assignmentId: string,
    @Body() body: SubstituteBody,
  ) {
    return this.ministries.substituteAssignment(user, assignmentId, body);
  }
}
