import { Body, Controller, Get, Param, Patch, Post, Query, Res, StreamableFile } from "@nestjs/common";
import type { Response } from "express";
import { ROLE_CODES } from "@idbrf/shared";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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
import { ServiceOrdersService } from "./service-orders.service";
import { ServiceOrderPlannerService } from "./service-order-planner.service";

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

  @IsOptional() @IsString() @MaxLength(80)
  responsiblePersonId?: string | null;

  @IsOptional() @IsString() @MaxLength(100)
  microphone?: string | null;

  @IsOptional() @IsString() @MaxLength(280)
  equipment?: string | null;

  @IsOptional() @IsString() @MaxLength(700)
  notes?: string | null;
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
  constructor(private readonly orders: ServiceOrdersService, private readonly planner: ServiceOrderPlannerService) {}

  @Roles(ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN)
  @Get("planning/rules")
  rules(@CurrentUser() user: AuthUser) { return this.planner.getRules(user); }

  @Roles(ROLE_CODES.PASTOR)
  @Patch("planning/rules")
  updateRules(@CurrentUser() user: AuthUser,
    @Body() body: { rules: unknown; expectedUpdatedAt?: string | null }) {
    return this.planner.saveRules(user, body.rules, body.expectedUpdatedAt);
  }

  @Roles(ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN)
  @Get("planning/preview")
  preview(@CurrentUser() user: AuthUser, @Query("year") year: string, @Query("month") month: string) {
    return this.planner.previewMonth(user, { year: Number(year), month: Number(month) });
  }

  @Roles(ROLE_CODES.PASTOR)
  @Post("planning/generate")
  generate(@CurrentUser() user: AuthUser,
    @Body() input: { year: number; month: number; expectedPolicyUpdatedAt?: string | null }) {
    return this.planner.generateMonth(user, {
      year: Number(input.year), month: Number(input.month),
      expectedPolicyUpdatedAt: input.expectedPolicyUpdatedAt,
    });
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
  @Get(":orderId/pdf")
  async pdf(@CurrentUser() user: AuthUser, @Param("orderId") id: string,
    @Res({ passthrough: true }) res: Response) {
    const pdf = await this.orders.pdf(user, id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Disposition", `attachment; filename="ordem-de-culto.pdf"`);
    return new StreamableFile(pdf);
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
