import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { IsIn, IsOptional, IsString, MinLength } from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { TransfersService } from "./transfers.service";

class CreateTransferBody {
  @IsString()
  @MinLength(1)
  personId!: string;

  @IsString()
  @MinLength(1)
  toChurchId!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

class AdvanceTransferBody {
  @IsIn(["APPROVE", "REJECT"])
  decision!: "APPROVE" | "REJECT";

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

@Controller("transfers")
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.transfers.list(user);
  }

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Get(":transferId")
  get(@CurrentUser() user: AuthUser, @Param("transferId") transferId: string) {
    return this.transfers.getById(user, transferId);
  }

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateTransferBody) {
    return this.transfers.create(user, body);
  }

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Post(":transferId/advance")
  advance(
    @CurrentUser() user: AuthUser,
    @Param("transferId") transferId: string,
    @Body() body: AdvanceTransferBody,
  ) {
    return this.transfers.advance(user, transferId, body);
  }
}
