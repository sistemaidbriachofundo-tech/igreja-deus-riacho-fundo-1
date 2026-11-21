import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
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
