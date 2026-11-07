import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { CoursesService } from "./courses.service";

class CreateCourseBody {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

class CreateClassBody {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  teacherPersonId?: string;

  @IsOptional()
  @IsString()
  startsAt?: string;

  @IsOptional()
  @IsString()
  endsAt?: string;
}

class EnrollBody {
  @IsString()
  @MinLength(1)
  personId!: string;
}

class CompleteEnrollmentBody {
  @IsOptional()
  @IsBoolean()
  issueCertificate?: boolean;
}

class AttendanceItemBody {
  @IsString()
  @MinLength(1)
  personId!: string;

  @IsOptional()
  @IsBoolean()
  present?: boolean;
}

class CreateSessionBody {
  @IsString()
  @MinLength(1)
  occurredAt!: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendanceItemBody)
  attendances?: AttendanceItemBody[];
}

const TEACH_ROLES = [
  ROLE_CODES.SECRETARIA,
  ROLE_CODES.PASTOR,
  ROLE_CODES.LIDER_MINISTERIO,
  ROLE_CODES.PLATFORM_ADMIN,
] as const;

@Controller("courses")
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Roles(...TEACH_ROLES)
  @Post()
  createCourse(@CurrentUser() user: AuthUser, @Body() body: CreateCourseBody) {
    return this.courses.createCourse(user, body);
  }

  @Roles(...TEACH_ROLES)
  @Get()
  listCourses(
    @CurrentUser() user: AuthUser,
    @Query("status") status?: string,
  ) {
    return this.courses.listCourses(user, status);
  }

  /** Rotas estáticas `enrollments` / `classes` antes de `:courseId`. */
  @Roles(...TEACH_ROLES)
  @Get("enrollments")
  listEnrollments(
    @CurrentUser() user: AuthUser,
    @Query("classId") classId?: string,
    @Query("personId") personId?: string,
    @Query("status") status?: string,
  ) {
    return this.courses.listEnrollments(user, { classId, personId, status });
  }

  @Roles(...TEACH_ROLES)
  @Post("enrollments/:enrollmentId/complete")
  completeEnrollment(
    @CurrentUser() user: AuthUser,
    @Param("enrollmentId") enrollmentId: string,
    @Body() body: CompleteEnrollmentBody,
  ) {
    return this.courses.completeEnrollment(user, enrollmentId, body);
  }

  @Roles(...TEACH_ROLES)
  @Get("classes/:classId/enrollments")
  listClassEnrollments(
    @CurrentUser() user: AuthUser,
    @Param("classId") classId: string,
    @Query("status") status?: string,
  ) {
    return this.courses.listEnrollments(user, { classId, status });
  }

  @Roles(...TEACH_ROLES)
  @Post("classes/:classId/enrollments")
  enroll(
    @CurrentUser() user: AuthUser,
    @Param("classId") classId: string,
    @Body() body: EnrollBody,
  ) {
    return this.courses.enroll(user, classId, body);
  }

  @Roles(...TEACH_ROLES)
  @Post("classes/:classId/sessions")
  createSession(
    @CurrentUser() user: AuthUser,
    @Param("classId") classId: string,
    @Body() body: CreateSessionBody,
  ) {
    return this.courses.createSession(user, classId, body);
  }

  @Roles(...TEACH_ROLES)
  @Get("classes/:classId/sessions")
  listSessions(
    @CurrentUser() user: AuthUser,
    @Param("classId") classId: string,
  ) {
    return this.courses.listSessions(user, classId);
  }

  @Roles(...TEACH_ROLES)
  @Post(":courseId/classes")
  createClass(
    @CurrentUser() user: AuthUser,
    @Param("courseId") courseId: string,
    @Body() body: CreateClassBody,
  ) {
    return this.courses.createClass(user, courseId, body);
  }

  @Roles(...TEACH_ROLES)
  @Get(":courseId/classes")
  listClasses(
    @CurrentUser() user: AuthUser,
    @Param("courseId") courseId: string,
  ) {
    return this.courses.listClasses(user, courseId);
  }
}
