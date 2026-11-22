import { Body, Controller, Delete, Get, Param, Patch, Post, Query, StreamableFile } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
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
import { ServiceOrdersService } from "./service-orders.service";

class ServiceOrderItemBody {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(180)
  minutes?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  responsible?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  roleKey?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  responsiblePersonId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  equipment?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  alert?: string | null;
}

class MonthBody {
  @IsInt()
  @Min(2024)
  @Max(2100)
  year!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;
}

class SlotBody {
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @Matches(/^\d{2}:\d{2}$/)
  time!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;
}

class RoleBody {
  @Matches(/^[a-z0-9_-]{1,40}$/)
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsInt()
  @Min(1)
  @Max(180)
  minutes!: number;

  @IsIn(["pool", "roster", "fixed"])
  source!: "pool" | "roster" | "fixed";

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  rosterRoleLabels?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  fixedLabel?: string;
}

class PoolBody {
  @Matches(/^[a-z0-9_-]{1,40}$/)
  roleKey!: string;

  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  personIds!: string[];
}

class PolicyBody {
  @IsInt()
  @Min(0)
  @Max(90)
  minGapDays!: number;

  @IsInt()
  @Min(1)
  @Max(31)
  monthlyLimitPerPerson!: number;

  @IsBoolean()
  avoidDualDirectionAndPreaching!: boolean;

  @IsBoolean()
  skipUnavailable!: boolean;

  @IsString()
  @MaxLength(40)
  blessingRoleKey!: string;

  @IsString()
  @MaxLength(40)
  directionRoleKey!: string;

  @IsString()
  @MaxLength(40)
  preachingRoleKey!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => SlotBody)
  slots!: SlotBody[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => RoleBody)
  roles!: RoleBody[];

  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => PoolBody)
  pools!: PoolBody[];
}

class ExceptionBody {
  @IsString()
  @MinLength(16)
  @MaxLength(40)
  serviceAt!: string;

  @IsIn(["SKIP", "SPECIAL"])
  kind!: "SKIP" | "SPECIAL";

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string | null;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  note!: string;
}

class ServiceOrderBody {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @IsString()
  @MinLength(16)
  @MaxLength(40)
  serviceAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => ServiceOrderItemBody)
  items!: ServiceOrderItemBody[];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  expectedUpdatedAt?: string;
}

class ServiceOrderExpectedBody {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  expectedUpdatedAt?: string;
}

@Controller("service-orders")
export class ServiceOrdersController {
  constructor(private readonly orders: ServiceOrdersService) {}

  @Roles(ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN)
  @Get("policy")
  policy(@CurrentUser() user: AuthUser) {
    return this.orders.policy(user);
  }

  @Roles(ROLE_CODES.PASTOR)
  @Patch("policy")
  updatePolicy(@CurrentUser() user: AuthUser, @Body() body: PolicyBody) {
    return this.orders.updatePolicy(user, body);
  }

  @Roles(ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN)
  @Get("exceptions")
  exceptions(@CurrentUser() user: AuthUser, @Query("year") year: string, @Query("month") month: string) {
    return this.orders.exceptions(user, Number(year), Number(month));
  }

  @Roles(ROLE_CODES.PASTOR)
  @Post("exceptions")
  addException(@CurrentUser() user: AuthUser, @Body() body: ExceptionBody) {
    return this.orders.addException(user, body);
  }

  @Roles(ROLE_CODES.PASTOR)
  @Delete("exceptions/:exceptionId")
  removeException(@CurrentUser() user: AuthUser, @Param("exceptionId") exceptionId: string) {
    return this.orders.removeException(user, exceptionId);
  }

  @Roles(ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN)
  @Post("preview")
  preview(@CurrentUser() user: AuthUser, @Body() body: MonthBody) {
    return this.orders.preview(user, body.year, body.month);
  }

  @Roles(ROLE_CODES.PASTOR)
  @Post("generate")
  generate(@CurrentUser() user: AuthUser, @Body() body: MonthBody) {
    return this.orders.generate(user, body.year, body.month);
  }

  @Roles(ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN)
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.orders.list(user);
  }

  @Roles(ROLE_CODES.PASTOR)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: ServiceOrderBody) {
    return this.orders.create(user, body);
  }

  @Roles(ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN)
  @Get(":orderId")
  get(@CurrentUser() user: AuthUser, @Param("orderId") orderId: string) {
    return this.orders.getById(user, orderId);
  }

  @Roles(ROLE_CODES.PASTOR)
  @Patch(":orderId")
  update(
    @CurrentUser() user: AuthUser,
    @Param("orderId") orderId: string,
    @Body() body: ServiceOrderBody,
  ) {
    return this.orders.update(user, orderId, body);
  }

  @Roles(ROLE_CODES.PASTOR)
  @Post(":orderId/approve")
  approve(
    @CurrentUser() user: AuthUser,
    @Param("orderId") orderId: string,
    @Body() body: ServiceOrderExpectedBody,
  ) {
    return this.orders.approve(user, orderId, body?.expectedUpdatedAt);
  }

  @Roles(ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN)
  @Get(":orderId/pdf")
  async pdf(@CurrentUser() user: AuthUser, @Param("orderId") orderId: string) {
    const bytes = await this.orders.pdf(user, orderId);
    return new StreamableFile(bytes, { type: "application/pdf", disposition: 'attachment; filename="ordem-de-culto.pdf"' });
  }

  @Roles(ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN)
  @Get(":orderId/briefing")
  briefing(@CurrentUser() user: AuthUser, @Param("orderId") orderId: string) {
    return this.orders.briefing(user, orderId);
  }

  @Roles(ROLE_CODES.PASTOR)
  @Post(":orderId/revise")
  revise(
    @CurrentUser() user: AuthUser,
    @Param("orderId") orderId: string,
    @Body() body: ServiceOrderExpectedBody,
  ) {
    return this.orders.revise(user, orderId, body?.expectedUpdatedAt);
  }

  @Roles(ROLE_CODES.PASTOR)
  @Post(":orderId/publish")
  publish(
    @CurrentUser() user: AuthUser,
    @Param("orderId") orderId: string,
    @Body() body: ServiceOrderExpectedBody,
  ) {
    return this.orders.publish(user, orderId, body?.expectedUpdatedAt);
  }
}
