import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { Type } from "class-transformer";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { DiscipleshipService } from "./discipleship.service";

class CreateTrackBody {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

class CreateStageBody {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  code?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sortOrder?: number;
}

class CreateEnrollmentBody {
  @IsString()
  @MinLength(1)
  trackId!: string;

  @IsString()
  @MinLength(1)
  personId!: string;

  @IsOptional()
  @IsString()
  mentorPersonId?: string;
}

class UpdateEnrollmentStatusBody {
  @IsString()
  @IsIn(["ACTIVE", "COMPLETED", "PAUSED", "CANCELLED"])
  status!: string;
}

class RecordProgressBody {
  @IsString()
  @MinLength(1)
  stageId!: string;

  @IsString()
  @IsIn(["STARTED", "COMPLETED", "REOPENED"])
  kind!: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;
}

const LEAD_ROLES = [
  ROLE_CODES.SECRETARIA,
  ROLE_CODES.PASTOR,
  ROLE_CODES.LIDER_MINISTERIO,
  ROLE_CODES.PLATFORM_ADMIN,
] as const;

@Controller("discipleship")
export class DiscipleshipController {
  constructor(private readonly discipleship: DiscipleshipService) {}

  @Roles(...LEAD_ROLES)
  @Post("tracks")
  createTrack(@CurrentUser() user: AuthUser, @Body() body: CreateTrackBody) {
    return this.discipleship.createTrack(user, body);
  }

  @Roles(...LEAD_ROLES)
  @Get("tracks")
  listTracks(@CurrentUser() user: AuthUser) {
    return this.discipleship.listTracks(user);
  }

  @Roles(...LEAD_ROLES)
  @Post("tracks/:trackId/stages")
  createStage(
    @CurrentUser() user: AuthUser,
    @Param("trackId") trackId: string,
    @Body() body: CreateStageBody,
  ) {
    return this.discipleship.createStage(user, trackId, body);
  }

  @Roles(...LEAD_ROLES)
  @Get("tracks/:trackId/stages")
  listStages(
    @CurrentUser() user: AuthUser,
    @Param("trackId") trackId: string,
  ) {
    return this.discipleship.listStages(user, trackId);
  }

  @Roles(...LEAD_ROLES)
  @Post("enrollments")
  enroll(@CurrentUser() user: AuthUser, @Body() body: CreateEnrollmentBody) {
    return this.discipleship.enroll(user, body);
  }

  @Roles(...LEAD_ROLES)
  @Get("enrollments")
  listEnrollments(
    @CurrentUser() user: AuthUser,
    @Query("trackId") trackId?: string,
    @Query("personId") personId?: string,
    @Query("status") status?: string,
  ) {
    return this.discipleship.listEnrollments(user, {
      trackId,
      personId,
      status,
    });
  }

  @Roles(...LEAD_ROLES)
  @Patch("enrollments/:enrollmentId")
  updateEnrollmentStatus(
    @CurrentUser() user: AuthUser,
    @Param("enrollmentId") enrollmentId: string,
    @Body() body: UpdateEnrollmentStatusBody,
  ) {
    return this.discipleship.updateEnrollmentStatus(
      user,
      enrollmentId,
      body.status,
    );
  }

  @Roles(...LEAD_ROLES)
  @Post("enrollments/:enrollmentId/progress")
  recordProgress(
    @CurrentUser() user: AuthUser,
    @Param("enrollmentId") enrollmentId: string,
    @Body() body: RecordProgressBody,
  ) {
    return this.discipleship.recordProgress(user, enrollmentId, body);
  }

  @Roles(...LEAD_ROLES)
  @Get("enrollments/:enrollmentId/progress")
  getProgress(
    @CurrentUser() user: AuthUser,
    @Param("enrollmentId") enrollmentId: string,
  ) {
    return this.discipleship.getProgress(user, enrollmentId);
  }
}
