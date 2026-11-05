import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { IsIn, IsOptional, IsString, MinLength } from "class-validator";
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

@Controller("discipleship")
export class DiscipleshipController {
  constructor(private readonly discipleship: DiscipleshipService) {}

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Post("tracks")
  createTrack(@CurrentUser() user: AuthUser, @Body() body: CreateTrackBody) {
    return this.discipleship.createTrack(user, body);
  }

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Get("tracks")
  listTracks(@CurrentUser() user: AuthUser) {
    return this.discipleship.listTracks(user);
  }

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Post("enrollments")
  enroll(@CurrentUser() user: AuthUser, @Body() body: CreateEnrollmentBody) {
    return this.discipleship.enroll(user, body);
  }

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.LIDER_MINISTERIO,
    ROLE_CODES.PLATFORM_ADMIN,
  )
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
}
