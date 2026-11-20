import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class ParticipantBody {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;
}

/** Campos RF-022 compartilhados entre inscrição staff e pública. */
export class RegistrationRf022Fields {
  @IsOptional()
  @IsString()
  lodgingOptionId?: string | null;

  @IsOptional()
  @IsString()
  mealOptionId?: string | null;

  @IsOptional()
  @IsString()
  transportOptionId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  partySize?: number;

  @IsOptional()
  @IsBoolean()
  isMinor?: boolean;

  @IsOptional()
  @IsString()
  guardianDisplayName?: string | null;

  @IsOptional()
  @IsBoolean()
  guardianAcknowledged?: boolean;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  notificationEmail?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParticipantBody)
  participants?: ParticipantBody[];
}

export class CreateRegistrationBody extends RegistrationRf022Fields {
  @IsString()
  @MinLength(2)
  displayName!: string;

  @IsString()
  @MinLength(1)
  modalityId!: string;

  @IsOptional()
  @IsString()
  lotId?: string | null;
}

export class PublicRegistrationBody extends RegistrationRf022Fields {
  @IsString()
  @MinLength(2)
  displayName!: string;

  @IsString()
  @MinLength(1)
  modalityId!: string;

  @IsString()
  @MinLength(1)
  lotId!: string;
}

export class CreateResourceOptionBody {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  kind?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number | null;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class GuardianAuthorizationBody {
  @IsIn(["AUTHORIZED", "REVOKED"])
  status!: "AUTHORIZED" | "REVOKED";

  @IsOptional()
  @IsString()
  acknowledgmentText?: string;
}
