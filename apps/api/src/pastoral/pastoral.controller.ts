import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { PastoralService } from "./pastoral.service";

class CreatePastoralCaseBody {
  @IsString()
  @MinLength(1)
  personId!: string;

  @IsString()
  @IsIn(["VISITA", "ORACAO", "ACOLHIMENTO", "ACOMPANHAMENTO", "OUTRO"])
  kind!: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  assignedToUserId?: string;

  @IsOptional()
  @IsString()
  dueAt?: string;
}

class UpdateStatusBody {
  @IsString()
  @IsIn(["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"])
  status!: string;
}

class AssignBody {
  @IsString()
  @MinLength(1)
  assignedToUserId!: string;
}

class CreateTaskBody {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  dueAt?: string;
}

class UpdateTaskBody {
  @IsBoolean()
  done!: boolean;
}

@Controller("pastoral-cases")
export class PastoralController {
  constructor(private readonly pastoral: PastoralService) {}

  @Roles(ROLE_CODES.PASTOR)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreatePastoralCaseBody) {
    return this.pastoral.create(user, body);
  }

  @Roles(ROLE_CODES.PASTOR)
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.pastoral.list(user);
  }

  @Roles(ROLE_CODES.PASTOR)
  @Get(":caseId")
  get(@CurrentUser() user: AuthUser, @Param("caseId") caseId: string) {
    return this.pastoral.getById(user, caseId);
  }

  @Roles(ROLE_CODES.PASTOR)
  @Patch(":caseId/status")
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param("caseId") caseId: string,
    @Body() body: UpdateStatusBody,
  ) {
    return this.pastoral.updateStatus(user, caseId, body.status);
  }

  @Roles(ROLE_CODES.PASTOR)
  @Patch(":caseId/assign")
  assign(
    @CurrentUser() user: AuthUser,
    @Param("caseId") caseId: string,
    @Body() body: AssignBody,
  ) {
    return this.pastoral.assign(user, caseId, body.assignedToUserId);
  }

  @Roles(ROLE_CODES.PASTOR)
  @Post(":caseId/tasks")
  addTask(
    @CurrentUser() user: AuthUser,
    @Param("caseId") caseId: string,
    @Body() body: CreateTaskBody,
  ) {
    return this.pastoral.addTask(user, caseId, body);
  }

  @Roles(ROLE_CODES.PASTOR)
  @Patch(":caseId/tasks/:taskId")
  updateTask(
    @CurrentUser() user: AuthUser,
    @Param("caseId") caseId: string,
    @Param("taskId") taskId: string,
    @Body() body: UpdateTaskBody,
  ) {
    return this.pastoral.updateTaskDone(user, caseId, taskId, body.done);
  }
}
