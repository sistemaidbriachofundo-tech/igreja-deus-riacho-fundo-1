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
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { AssetsService } from "./assets.service";

class CreateAssetBody {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  responsiblePersonId?: string;

  @IsOptional()
  @IsIn(["ACTIVE", "MAINTENANCE", "LOST", "DISPOSED"])
  status?: string;

  @IsOptional()
  @IsString()
  acquiredAt?: string;

  @IsOptional()
  @IsString()
  churchId?: string;
}

class UpdateAssetBody {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  responsiblePersonId?: string | null;

  @IsOptional()
  @IsIn(["ACTIVE", "MAINTENANCE", "LOST", "DISPOSED"])
  status?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  acquiredAt?: string | null;

  @IsOptional()
  @IsString()
  note?: string;
}

class AssetNoteBody {
  @IsString()
  @MinLength(1)
  note!: string;
}

const ASSET_ROLES = [
  ROLE_CODES.SECRETARIA,
  ROLE_CODES.PASTOR,
  ROLE_CODES.TESOURARIA,
  ROLE_CODES.PLATFORM_ADMIN,
] as const;

@Controller("assets")
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Roles(...ASSET_ROLES)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateAssetBody) {
    return this.assets.create(user, body);
  }

  @Roles(...ASSET_ROLES)
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("churchId") churchId?: string,
    @Query("status") status?: string,
  ) {
    return this.assets.list(user, { churchId, status });
  }

  @Roles(...ASSET_ROLES)
  @Get(":assetId")
  get(@CurrentUser() user: AuthUser, @Param("assetId") assetId: string) {
    return this.assets.getById(user, assetId);
  }

  @Roles(...ASSET_ROLES)
  @Patch(":assetId")
  update(
    @CurrentUser() user: AuthUser,
    @Param("assetId") assetId: string,
    @Body() body: UpdateAssetBody,
  ) {
    return this.assets.update(user, assetId, body);
  }

  @Roles(...ASSET_ROLES)
  @Get(":assetId/history")
  history(
    @CurrentUser() user: AuthUser,
    @Param("assetId") assetId: string,
  ) {
    return this.assets.listHistory(user, assetId);
  }

  @Roles(...ASSET_ROLES)
  @Post(":assetId/history")
  addNote(
    @CurrentUser() user: AuthUser,
    @Param("assetId") assetId: string,
    @Body() body: AssetNoteBody,
  ) {
    return this.assets.addNote(user, assetId, body.note);
  }
}
