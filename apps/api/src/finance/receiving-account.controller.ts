import { Body, Controller, Param, Patch, Post } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { ReceivingAccountService } from "./receiving-account.service";

class CreateReceivingAccountBody {
  @IsString()
  @MinLength(1)
  ledgerAccountId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  displayName!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(120)
  pixKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(15)
  merchantCity?: string;
}

class MercadoPagoAccountBody {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  collectorId?: string | null;
}

@Controller("ledger")
export class ReceivingAccountController {
  constructor(private readonly accounts: ReceivingAccountService) {}

  @Roles(ROLE_CODES.TESOURARIA)
  @Post("receiving-accounts")
  create(@CurrentUser() user: AuthUser, @Body() body: CreateReceivingAccountBody) {
    return this.accounts.create(user, body);
  }

  @Roles(ROLE_CODES.TESOURARIA)
  @Patch("receiving-accounts/:accountId/mercado-pago")
  mercadoPago(
    @CurrentUser() user: AuthUser,
    @Param("accountId") accountId: string,
    @Body() body: MercadoPagoAccountBody,
  ) {
    return this.accounts.enableMercadoPago(user, accountId, body);
  }
}
