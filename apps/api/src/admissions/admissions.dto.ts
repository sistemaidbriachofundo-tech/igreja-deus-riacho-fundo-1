import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

export class CreateAdmissionBody {
  @IsOptional()
  @IsString()
  personId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  displayName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  householdId?: string;

  @IsOptional()
  @IsIn(["BATISMO", "TRANSFERENCIA", "RECONCILIACAO", "OUTRO"])
  modality?: "BATISMO" | "TRANSFERENCIA" | "RECONCILIACAO" | "OUTRO";

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AdvanceAdmissionBody {
  @IsIn(["modality", "documents", "secretaria", "pastor"])
  completeStep!: "modality" | "documents" | "secretaria" | "pastor";

  @IsOptional()
  @IsIn(["BATISMO", "TRANSFERENCIA", "RECONCILIACAO", "OUTRO"])
  modality?: "BATISMO" | "TRANSFERENCIA" | "RECONCILIACAO" | "OUTRO";

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsIn(["APPROVE", "REJECT"])
  decision?: "APPROVE" | "REJECT";

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
