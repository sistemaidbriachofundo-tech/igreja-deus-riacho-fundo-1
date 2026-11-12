import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ROLE_CODES } from "@idbrf/shared";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import type { Response } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { RequireAccess } from "../auth/decorators/require-access.decorator";
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

  @IsOptional()
  @IsString()
  costCenterId?: string;
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

  @IsOptional()
  @IsString()
  costCenterId?: string | null;
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

  @IsOptional()
  @IsString()
  fundId?: string;

  @IsOptional()
  @IsString()
  costCenterId?: string;

  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  competenceYear?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  competenceMonth?: number;
}

class RejectEntryBody {
  @IsOptional()
  @IsString()
  reason?: string;
}

class CreateExpenseBody {
  @IsUUID("4")
  requestId!: string;

  @IsString()
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
  cashAccountId!: string;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  amountCents!: number;

  @IsOptional()
  @IsString()
  costCenterId?: string;
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

  @IsOptional()
  @IsString()
  @IsIn(["FILE", "MOCK", "SICOOB", "BRB", "CORA"])
  adapter?: string;
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

class CodeNameBody {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  name!: string;
}

class PatchActiveNameBody {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

class CreateBudgetBody {
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

class PatchBudgetBody {
  @IsOptional()
  @IsString()
  @IsIn(["DRAFT", "ACTIVE", "CLOSED"])
  status?: string;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

class AddBudgetLineBody {
  @IsString()
  @MinLength(1)
  accountId!: string;

  @IsInt()
  @Min(0)
  plannedCents!: number;

  @IsOptional()
  @IsString()
  fundId?: string;

  @IsOptional()
  @IsString()
  costCenterId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

class OpenPeriodBody {
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

@Controller("ledger")
@Roles(ROLE_CODES.TESOURARIA)
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get("bank-adapters")
  listBankAdapters() {
    return this.finance.listBankAdapters();
  }

  @Roles(ROLE_CODES.TESOURARIA, ROLE_CODES.PLATFORM_ADMIN)
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

  @Get("funds")
  listFunds(@CurrentUser() user: AuthUser) {
    return this.finance.listFunds(user);
  }

  @Post("funds")
  createFund(@CurrentUser() user: AuthUser, @Body() body: CodeNameBody) {
    return this.finance.createFund(user, body);
  }

  @Patch("funds/:fundId")
  patchFund(
    @CurrentUser() user: AuthUser,
    @Param("fundId") fundId: string,
    @Body() body: PatchActiveNameBody,
  ) {
    return this.finance.patchFund(user, fundId, body);
  }

  @Roles(ROLE_CODES.TESOURARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Get("cost-centers")
  listCostCenters(@CurrentUser() user: AuthUser) {
    return this.finance.listCostCenters(user);
  }

  @Post("cost-centers")
  createCostCenter(@CurrentUser() user: AuthUser, @Body() body: CodeNameBody) {
    return this.finance.createCostCenter(user, body);
  }

  @Patch("cost-centers/:costCenterId")
  patchCostCenter(
    @CurrentUser() user: AuthUser,
    @Param("costCenterId") costCenterId: string,
    @Body() body: PatchActiveNameBody,
  ) {
    return this.finance.patchCostCenter(user, costCenterId, body);
  }

  @Roles(ROLE_CODES.TESOURARIA, ROLE_CODES.PLATFORM_ADMIN)
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

  @Post("expenses")
  createExpense(@CurrentUser() user: AuthUser, @Body() body: CreateExpenseBody) {
    return this.finance.createExpense(user, body);
  }

  /** Aprovações de despesas pendentes, sem abrir o extrato completo ao pastor. */
  @Roles(ROLE_CODES.TESOURARIA, ROLE_CODES.PASTOR)
  @RequireAccess({ resource: "ledger", action: "approve" })
  @Get("expense-approvals")
  listExpenseApprovals(@CurrentUser() user: AuthUser) {
    return this.finance.listExpenseApprovals(user);
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

  @Roles(ROLE_CODES.TESOURARIA, ROLE_CODES.PASTOR)
  @RequireAccess({ resource: "ledger", action: "approve" })
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

  @Get("entries/:entryId/attachments")
  listAttachments(
    @CurrentUser() user: AuthUser,
    @Param("entryId") entryId: string,
  ) {
    return this.finance.listAttachments(user, entryId);
  }

  @Post("entries/:entryId/attachments")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadAttachment(
    @CurrentUser() user: AuthUser,
    @Param("entryId") entryId: string,
    @UploadedFile()
    file?: { originalname: string; mimetype: string; buffer: Buffer; size: number },
  ) {
    if (!file?.buffer) {
      throw new BadRequestException("Campo multipart `file` é obrigatório");
    }
    return this.finance.uploadAttachment(user, entryId, file);
  }

  @Get("entries/:entryId/attachments/:attachmentId")
  async downloadAttachment(
    @CurrentUser() user: AuthUser,
    @Param("entryId") entryId: string,
    @Param("attachmentId") attachmentId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.finance.downloadAttachment(
      user,
      entryId,
      attachmentId,
    );
    res.setHeader("Content-Type", file.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(file.displayName)}"`,
    );
    return new StreamableFile(file.bytes);
  }

  @Delete("entries/:entryId/attachments/:attachmentId")
  removeAttachment(
    @CurrentUser() user: AuthUser,
    @Param("entryId") entryId: string,
    @Param("attachmentId") attachmentId: string,
  ) {
    return this.finance.removeAttachment(user, entryId, attachmentId);
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

  @Get("budgets")
  listBudgets(
    @CurrentUser() user: AuthUser,
    @Query("year") yearRaw?: string,
  ) {
    const year = yearRaw ? Number.parseInt(yearRaw, 10) : undefined;
    return this.finance.listBudgets(
      user,
      year !== undefined && Number.isFinite(year) ? year : undefined,
    );
  }

  @Post("budgets")
  createBudget(@CurrentUser() user: AuthUser, @Body() body: CreateBudgetBody) {
    return this.finance.createBudget(user, body);
  }

  @Get("budgets/:budgetId")
  getBudget(
    @CurrentUser() user: AuthUser,
    @Param("budgetId") budgetId: string,
  ) {
    return this.finance.getBudget(user, budgetId);
  }

  @Patch("budgets/:budgetId")
  patchBudget(
    @CurrentUser() user: AuthUser,
    @Param("budgetId") budgetId: string,
    @Body() body: PatchBudgetBody,
  ) {
    return this.finance.patchBudget(user, budgetId, body);
  }

  @Post("budgets/:budgetId/lines")
  addBudgetLine(
    @CurrentUser() user: AuthUser,
    @Param("budgetId") budgetId: string,
    @Body() body: AddBudgetLineBody,
  ) {
    return this.finance.addBudgetLine(user, budgetId, body);
  }

  @Get("periods")
  listPeriods(@CurrentUser() user: AuthUser) {
    return this.finance.listPeriods(user);
  }

  @Post("periods")
  openPeriod(@CurrentUser() user: AuthUser, @Body() body: OpenPeriodBody) {
    return this.finance.openPeriod(user, body);
  }

  @Post("periods/:periodId/close")
  closePeriod(
    @CurrentUser() user: AuthUser,
    @Param("periodId") periodId: string,
  ) {
    return this.finance.closePeriod(user, periodId);
  }

  @Roles(ROLE_CODES.TESOURARIA, ROLE_CODES.PLATFORM_ADMIN)
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
