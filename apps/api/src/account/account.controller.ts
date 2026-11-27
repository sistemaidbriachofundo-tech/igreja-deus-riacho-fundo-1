import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Patch,
  Post,
  Put,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { IsString, MaxLength, MinLength, ValidateIf } from "class-validator";
import type { Response } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { BusinessException } from "../common/business.exception";
import { PROFILE_PHOTO_MAX_INPUT_BYTES } from "./account-photo";
import { AccountService } from "./account.service";

export class PatchAccountBody {
  /** `null` limpa. Ausente é recusado no controller. Qualquer outro campo cai no pipe. */
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(20)
  phone?: string | null;
}

export class ChangePasswordBody {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  newPassword!: string;
}

@Controller("account")
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Header("Cache-Control", "private, no-store")
  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.account.getProfile(user);
  }

  @Header("Cache-Control", "private, no-store")
  @Patch("me")
  patch(@CurrentUser() user: AuthUser, @Body() body: PatchAccountBody) {
    if (body.phone === undefined) {
      throw new BusinessException("Informe phone ou null.", "ACCOUNT_PHONE_INVALID", 400);
    }
    return this.account.updatePhone(user, body.phone);
  }

  @HttpCode(204)
  @Post("me/password")
  async password(@CurrentUser() user: AuthUser, @Body() body: ChangePasswordBody) {
    await this.account.changePassword(user, body.currentPassword, body.newPassword);
  }

  @HttpCode(204)
  @Put("me/photo")
  @UseInterceptors(FileInterceptor("photo", { limits: { fileSize: PROFILE_PHOTO_MAX_INPUT_BYTES } }))
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: { buffer?: Buffer; size?: number },
  ) {
    if (!file?.buffer?.length) {
      throw new BusinessException("Envie a foto no campo photo.", "ACCOUNT_PHOTO_REQUIRED", 400);
    }
    const size = Math.max(file.size ?? 0, file.buffer.length);
    if (size > PROFILE_PHOTO_MAX_INPUT_BYTES) {
      throw new BusinessException("A foto passa de 5 MiB.", "ACCOUNT_PHOTO_TOO_LARGE", 400);
    }
    await this.account.replacePhoto(user, file.buffer);
  }

  @Header("Cache-Control", "private, no-store")
  @Get("me/photo")
  async photo(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const bytes = await this.account.readPhoto(user);
    response.setHeader("Content-Type", "image/jpeg");
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    return new StreamableFile(bytes);
  }
}
