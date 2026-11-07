import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from "class-validator";
import { Type } from "class-transformer";
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

class RetentionPolicyBody {
  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(36500)
  closedCaseRetentionDays!: number;

  @IsOptional()
  @IsBoolean()
  redactionEnabled?: boolean;
}

class ExportBody {
  @IsOptional()
  @IsString()
  personId?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsIn(["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"])
  status?: string;
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

  /** RF-009 — rotas estáticas antes de `:caseId`. */
  @Roles(ROLE_CODES.PASTOR)
  @Get("retention-policy")
  getRetentionPolicy(@CurrentUser() user: AuthUser) {
    return this.pastoral.getRetentionPolicy(user);
  }

  @Roles(ROLE_CODES.PASTOR)
  @Put("retention-policy")
  upsertRetentionPolicy(
    @CurrentUser() user: AuthUser,
    @Body() body: RetentionPolicyBody,
  ) {
    return this.pastoral.upsertRetentionPolicy(user, body);
  }

  @Roles(ROLE_CODES.PASTOR)
  @Post("retention/apply")
  applyRetention(@CurrentUser() user: AuthUser) {
    return this.pastoral.applyRetention(user);
  }

  @Roles(ROLE_CODES.PASTOR)
  @Post("export")
  exportCases(
    @CurrentUser() user: AuthUser,
    @Body() body: ExportBody = {},
    @Query("personId") personId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("status") status?: string,
  ) {
    const payload = body ?? {};
    return this.pastoral.exportCases(user, {
      personId: payload.personId ?? personId,
      from: payload.from ?? from,
      to: payload.to ?? to,
      status: payload.status ?? status,
    });
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
