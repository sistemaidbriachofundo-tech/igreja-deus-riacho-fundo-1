import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { TreasuryService } from "./treasury.service";

class CashReceiptBody {
  @IsString()
  @Matches(/^[A-Za-z0-9:._-]{8,80}$/)
  idempotencyKey!: string;

  @IsString()
  @MinLength(1)
  entryDate!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(180)
  description!: string;

  @IsString()
  @MinLength(1)
  cashAccountId!: string;

  @IsString()
  @MinLength(1)
  revenueAccountId!: string;

  @IsInt()
  @Min(1)
  @Max(100_000_000_00)
  grossCents!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  feeCents?: number;

  @IsOptional()
  @IsString()
  feeAccountId?: string;

  @IsOptional()
  @IsString()
  costCenterId?: string;

  @IsOptional()
  @IsString()
  fundId?: string;
}

class ReceivableBody {
  @IsString()
  @Matches(/^[A-Za-z0-9:._-]{8,80}$/)
  idempotencyKey!: string;

  @IsString()
  @MinLength(1)
  entryDate!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(180)
  description!: string;

  @IsString()
  @MinLength(1)
  receivableAccountId!: string;

  @IsString()
  @MinLength(1)
  revenueAccountId!: string;

  @IsInt()
  @Min(1)
  @Max(100_000_000_00)
  grossCents!: number;

  @IsOptional()
  @IsString()
  costCenterId?: string;

  @IsOptional()
  @IsString()
  fundId?: string;
}

class CommitmentBody {
  @IsString()
  @Matches(/^[A-Za-z0-9:._-]{8,80}$/)
  idempotencyKey!: string;

  @IsString()
  @MinLength(1)
  entryDate!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(180)
  description!: string;

  @IsString()
  @MinLength(1)
  expenseAccountId!: string;

  @IsString()
  @MinLength(1)
  payableAccountId!: string;

  @IsInt()
  @Min(1)
  @Max(100_000_000_00)
  amountCents!: number;

  @IsOptional()
  @IsString()
  costCenterId?: string;

  @IsOptional()
  @IsString()
  fundId?: string;
}

class SettlementBody {
  @IsString()
  @Matches(/^[A-Za-z0-9:._-]{8,80}$/)
  idempotencyKey!: string;

  @IsString()
  @MinLength(1)
  entryDate!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(180)
  description!: string;

  @IsString()
  @MinLength(1)
  payableAccountId!: string;

  @IsString()
  @MinLength(1)
  cashAccountId!: string;

  @IsInt()
  @Min(1)
  @Max(100_000_000_00)
  amountCents!: number;

  @IsOptional()
  @IsString()
  costCenterId?: string;

  @IsOptional()
  @IsString()
  fundId?: string;
}

@Controller("treasury")
@Roles(ROLE_CODES.TESOURARIA)
export class TreasuryController {
  constructor(private readonly treasury: TreasuryService) {}

  @Get("position")
  position(
    @CurrentUser() actor: AuthUser,
    @Query("costCenterId") costCenterId?: string,
  ) {
    return this.treasury.position(actor, costCenterId);
  }

  @Post("cash-receipts")
  cashReceipt(@CurrentUser() actor: AuthUser, @Body() body: CashReceiptBody) {
    return this.treasury.postCashReceipt(actor, body);
  }

  @Post("receivables")
  receivable(@CurrentUser() actor: AuthUser, @Body() body: ReceivableBody) {
    return this.treasury.postReceivable(actor, body);
  }

  @Post("commitments")
  commitment(@CurrentUser() actor: AuthUser, @Body() body: CommitmentBody) {
    return this.treasury.postCommitment(actor, body);
  }

  @Post("settlements")
  settlement(@CurrentUser() actor: AuthUser, @Body() body: SettlementBody) {
    return this.treasury.postSettlement(actor, body);
  }
}
