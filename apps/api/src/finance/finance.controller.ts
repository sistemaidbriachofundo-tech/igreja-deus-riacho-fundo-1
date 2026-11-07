import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { FinanceService } from "./finance.service";

class CreateAccountBody {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @IsIn(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"])
  type!: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsString()
  costCenter?: string;
}

class PatchAccountBody {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  costCenter?: string | null;
}

class EntryLineBody {
  @IsString()
  @MinLength(1)
  accountId!: string;

  @IsString()
  @IsIn(["DEBIT", "CREDIT"])
  side!: string;

  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsOptional()
  @IsString()
  memo?: string;
}

class CreateEntryBody {
  @IsString()
  @MinLength(1)
  entryDate!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EntryLineBody)
  lines!: EntryLineBody[];
}

class RejectEntryBody {
  @IsOptional()
  @IsString()
  reason?: string;
}

class MatchBankLineBody {
  @IsString()
  @MinLength(1)
  entryId!: string;

  @IsOptional()
  @IsString()
  reconciliationId?: string;
}

class CreateImportBody {
  @IsString()
  @IsIn(["CSV", "OFX", "PDF_META"])
  format!: string;

  @IsString()
  @MinLength(1)
  filename!: string;

  @IsOptional()
  @IsString()
  textContent?: string;
}

class CreateReconciliationBody {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  periodStart!: string;

  @IsString()
  @MinLength(1)
  periodEnd!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

@Controller("ledger")
@Roles(ROLE_CODES.TESOURARIA)
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get("accounts")
  listAccounts(@CurrentUser() user: AuthUser) {
    return this.finance.listAccounts(user);
  }

  @Post("accounts")
  createAccount(@CurrentUser() user: AuthUser, @Body() body: CreateAccountBody) {
    return this.finance.createAccount(user, body);
  }

  @Get("accounts/:accountId")
  getAccount(
    @CurrentUser() user: AuthUser,
    @Param("accountId") accountId: string,
  ) {
    return this.finance.getAccount(user, accountId);
  }

  @Patch("accounts/:accountId")
  patchAccount(
    @CurrentUser() user: AuthUser,
    @Param("accountId") accountId: string,
    @Body() body: PatchAccountBody,
  ) {
    return this.finance.patchAccount(user, accountId, body);
  }

  @Get("entries")
  listEntries(
    @CurrentUser() user: AuthUser,
    @Query("status") status?: string,
  ) {
    return this.finance.listEntries(user, status);
  }

  @Post("entries")
  createEntry(@CurrentUser() user: AuthUser, @Body() body: CreateEntryBody) {
    return this.finance.createEntry(user, body);
  }

  @Get("entries/:entryId")
  getEntry(@CurrentUser() user: AuthUser, @Param("entryId") entryId: string) {
    return this.finance.getEntry(user, entryId);
  }

  @Post("entries/:entryId/submit")
  submitEntry(
    @CurrentUser() user: AuthUser,
    @Param("entryId") entryId: string,
  ) {
    return this.finance.submitEntry(user, entryId);
  }

  @Post("entries/:entryId/approve")
  approveEntry(
    @CurrentUser() user: AuthUser,
    @Param("entryId") entryId: string,
  ) {
    return this.finance.approveEntry(user, entryId);
  }

  @Post("entries/:entryId/reject")
  rejectEntry(
    @CurrentUser() user: AuthUser,
    @Param("entryId") entryId: string,
    @Body() body: RejectEntryBody,
  ) {
    return this.finance.rejectEntry(user, entryId, body.reason);
  }

  @Post("entries/:entryId/reverse")
  reverseEntry(
    @CurrentUser() user: AuthUser,
    @Param("entryId") entryId: string,
  ) {
    return this.finance.reverseEntry(user, entryId);
  }

  @Get("imports")
  listImports(@CurrentUser() user: AuthUser) {
    return this.finance.listImports(user);
  }

  @Post("imports")
  createImport(@CurrentUser() user: AuthUser, @Body() body: CreateImportBody) {
    return this.finance.createImport(user, body);
  }

  @Get("imports/:batchId")
  getImport(@CurrentUser() user: AuthUser, @Param("batchId") batchId: string) {
    return this.finance.getImport(user, batchId);
  }

  @Get("reconciliations")
  listReconciliations(@CurrentUser() user: AuthUser) {
    return this.finance.listReconciliations(user);
  }

  @Post("reconciliations")
  createReconciliation(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateReconciliationBody,
  ) {
    return this.finance.createReconciliation(user, body);
  }

  @Get("reconciliations/:reconciliationId")
  getReconciliation(
    @CurrentUser() user: AuthUser,
    @Param("reconciliationId") reconciliationId: string,
  ) {
    return this.finance.getReconciliation(user, reconciliationId);
  }

  @Post("reconciliations/:reconciliationId/submit")
  submitReconciliation(
    @CurrentUser() user: AuthUser,
    @Param("reconciliationId") reconciliationId: string,
  ) {
    return this.finance.submitReconciliation(user, reconciliationId);
  }

  @Post("reconciliations/:reconciliationId/approve")
  approveReconciliation(
    @CurrentUser() user: AuthUser,
    @Param("reconciliationId") reconciliationId: string,
  ) {
    return this.finance.approveReconciliation(user, reconciliationId);
  }

  @Post("reconciliations/:reconciliationId/close")
  closeReconciliation(
    @CurrentUser() user: AuthUser,
    @Param("reconciliationId") reconciliationId: string,
  ) {
    return this.finance.closeReconciliation(user, reconciliationId);
  }

  @Post("bank-lines/:lineId/match")
  matchBankLine(
    @CurrentUser() user: AuthUser,
    @Param("lineId") lineId: string,
    @Body() body: MatchBankLineBody,
  ) {
    return this.finance.matchBankLine(user, lineId, body);
  }

  @Post("bank-lines/:lineId/unmatch")
  unmatchBankLine(
    @CurrentUser() user: AuthUser,
    @Param("lineId") lineId: string,
  ) {
    return this.finance.unmatchBankLine(user, lineId);
  }
}
