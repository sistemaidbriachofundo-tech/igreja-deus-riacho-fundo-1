import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { CULT_TYPES, type CultType } from "../rosters/roster-operating-rules";
import { MinistriesService } from "./ministries.service";

const LEAD_ROLES = [
  ROLE_CODES.SECRETARIA,
  ROLE_CODES.PASTOR,
  ROLE_CODES.LIDER_MINISTERIO,
  ROLE_CODES.PLATFORM_ADMIN,
] as const;

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

  @IsOptional()
  @IsString()
  @MinLength(1)
  moduleId?: string;

  @IsOptional()
  @IsIn(CULT_TYPES)
  serviceType?: CultType;
}

class RosterModuleBody {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}

class EditRosterBody {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @IsString()
  @MinLength(1)
  serviceAt!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  moduleId?: string | null;
}

class EditRosterSlotBody {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  roleLabel!: string;
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

  @IsOptional()
  @IsString()
  coupleExceptionId?: string;
}

class SubstituteBody {
  @IsString()
  @MinLength(1)
  personId!: string;

  @IsOptional()
  @IsString()
  partnerPersonId?: string;

  @IsOptional()
  @IsString()
  coupleExceptionId?: string;
}

class CreateAvailabilityBody {
  @IsString()
  @MinLength(1)
  personId!: string;

  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @IsInt()
  @Min(0)
  @Max(1439)
  startMinute!: number;

  @IsInt()
  @Min(1)
  @Max(1440)
  endMinute!: number;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

class CreateImpedimentBody {
  @IsString()
  @MinLength(1)
  personId!: string;

  @IsString()
  @MinLength(1)
  startsAt!: string;

  @IsString()
  @MinLength(1)
  endsAt!: string;

  @IsOptional()
  @IsString()
  reason?: string | null;
}

class CoupleExceptionBody {
  @IsString()
  @MinLength(1)
  personId!: string;

  @IsString()
  @MinLength(1)
  reason!: string;

  @IsOptional()
  @IsString()
  slotId?: string;

  @IsOptional()
  @IsString()
  rosterId?: string;

  @IsOptional()
  @IsString()
  ministryId?: string;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsBoolean()
  approveNow?: boolean;
}

class ResendAlertBody {
  @IsIn(["confirm", "decline", "substitute", "confirm_request"])
  kind!: "confirm" | "decline" | "substitute" | "confirm_request";
}

@Controller("ministries")
export class MinistriesController {
  constructor(private readonly ministries: MinistriesService) {}

  @Roles(...LEAD_ROLES)
  @Patch(":ministryId/roster-modules/:moduleId/rules")
  saveRosterModuleRules(
    @CurrentUser() user: AuthUser,
    @Param("ministryId") ministryId: string,
    @Param("moduleId") moduleId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.ministries.saveRosterModuleRules(user, ministryId, moduleId, body);
  }

  @Roles(...LEAD_ROLES)
  @Post(":ministryId/roster-modules")
  createRosterModule(
    @CurrentUser() user: AuthUser,
    @Param("ministryId") ministryId: string,
    @Body() body: RosterModuleBody,
  ) {
    return this.ministries.saveRosterModule(user, ministryId, body.name);
  }

  @Roles(...LEAD_ROLES)
  @Patch(":ministryId/roster-modules/:moduleId")
  renameRosterModule(
    @CurrentUser() user: AuthUser,
    @Param("ministryId") ministryId: string,
    @Param("moduleId") moduleId: string,
    @Body() body: RosterModuleBody,
  ) {
    return this.ministries.saveRosterModule(user, ministryId, body.name, moduleId);
  }

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

  @Roles(...LEAD_ROLES)
  @Patch(":rosterId")
  update(@CurrentUser() user: AuthUser, @Param("rosterId") rosterId: string, @Body() body: EditRosterBody) {
    return this.ministries.editRoster(user, rosterId, body);
  }

  @Roles(...LEAD_ROLES)
  @Patch(":rosterId/slots/:slotId")
  updateSlot(
    @CurrentUser() user: AuthUser,
    @Param("rosterId") rosterId: string,
    @Param("slotId") slotId: string,
    @Body() body: EditRosterSlotBody,
  ) {
    return this.ministries.editRosterSlot(user, rosterId, slotId, body.roleLabel);
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
  @Post(":rosterId/publish")
  publish(
    @CurrentUser() user: AuthUser,
    @Param("rosterId") rosterId: string,
  ) {
    return this.ministries.publishRoster(user, rosterId);
  }

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Post(":rosterId/close")
  close(
    @CurrentUser() user: AuthUser,
    @Param("rosterId") rosterId: string,
  ) {
    return this.ministries.closeRoster(user, rosterId);
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

  @Roles(...LEAD_ROLES)
  @Post(":assignmentId/alerts/resend")
  resendAlert(
    @CurrentUser() user: AuthUser,
    @Param("assignmentId") assignmentId: string,
    @Body() body: ResendAlertBody,
  ) {
    return this.ministries.resendAssignmentAlert(
      user,
      assignmentId,
      body.kind,
    );
  }
}

@Controller("volunteer-availabilities")
export class VolunteerAvailabilityController {
  constructor(private readonly ministries: MinistriesService) {}

  @Roles(...LEAD_ROLES)
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateAvailabilityBody,
  ) {
    return this.ministries.createAvailability(user, body);
  }

  @Roles(...LEAD_ROLES)
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("personId") personId?: string,
  ) {
    return this.ministries.listAvailability(user, personId);
  }

  @Roles(...LEAD_ROLES)
  @Post(":availabilityId/deactivate")
  deactivate(
    @CurrentUser() user: AuthUser,
    @Param("availabilityId") availabilityId: string,
  ) {
    return this.ministries.deactivateAvailability(user, availabilityId);
  }
}

@Controller("volunteer-impediments")
export class VolunteerImpedimentsController {
  constructor(private readonly ministries: MinistriesService) {}

  @Roles(...LEAD_ROLES)
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateImpedimentBody,
  ) {
    return this.ministries.createImpediment(user, body);
  }

  @Roles(...LEAD_ROLES)
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("personId") personId?: string,
  ) {
    return this.ministries.listImpediments(user, personId);
  }

  @Roles(...LEAD_ROLES)
  @Delete(":impedimentId")
  remove(
    @CurrentUser() user: AuthUser,
    @Param("impedimentId") impedimentId: string,
  ) {
    return this.ministries.deleteImpediment(user, impedimentId);
  }
}

@Controller("roster-couple-exceptions")
export class RosterCoupleExceptionsController {
  constructor(private readonly ministries: MinistriesService) {}

  @Roles(...LEAD_ROLES)
  @Post("simulate")
  simulate(
    @CurrentUser() user: AuthUser,
    @Body() body: CoupleExceptionBody,
  ) {
    return this.ministries.simulateCoupleException(user, body);
  }

  @Roles(...LEAD_ROLES)
  @Post()
  configure(
    @CurrentUser() user: AuthUser,
    @Body() body: CoupleExceptionBody,
  ) {
    return this.ministries.configureCoupleException(user, body);
  }

  @Roles(...LEAD_ROLES)
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("status") status?: string,
    @Query("personId") personId?: string,
  ) {
    return this.ministries.listCoupleExceptions(user, { status, personId });
  }

  @Roles(...LEAD_ROLES)
  @Post(":exceptionId/approve")
  approve(
    @CurrentUser() user: AuthUser,
    @Param("exceptionId") exceptionId: string,
  ) {
    return this.ministries.approveCoupleException(user, exceptionId);
  }

  @Roles(...LEAD_ROLES)
  @Post(":exceptionId/reject")
  reject(
    @CurrentUser() user: AuthUser,
    @Param("exceptionId") exceptionId: string,
  ) {
    return this.ministries.rejectCoupleException(user, exceptionId);
  }
}
