import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ADMISSION_MODALITIES, ROLE_CODES } from "@idbrf/shared";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from "class-validator";
import type { Response } from "express";
import { memoryStorage } from "multer";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { AdmissionDocumentsService } from "./admission-documents.service";
import { AdmissionsService } from "./admissions.service";
import {
  AdvanceAdmissionBody,
  CreateAdmissionBody,
} from "./admissions.dto";

class CreateDocumentRequirementBody {
  @IsIn(Object.values(ADMISSION_MODALITIES))
  modality!: string;

  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(40)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  sortOrder?: number;
}

class PatchDocumentRequirementBody {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  sortOrder?: number;
}

@Controller("admissions")
export class AdmissionsController {
  constructor(
    private readonly admissions: AdmissionsService,
    private readonly documents: AdmissionDocumentsService,
  ) {}

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Get()
  list(@CurrentUser() user: AuthUser, @Query("status") status?: string) {
    return this.admissions.list(user, status);
  }

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateAdmissionBody) {
    return this.admissions.create(user, body);
  }

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN)
  @Get("document-requirements")
  listRequirements(@CurrentUser() user: AuthUser, @Query("modality") modality?: string) {
    return this.documents.listRequirements(user, modality);
  }

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Post("document-requirements")
  createRequirement(@CurrentUser() user: AuthUser, @Body() body: CreateDocumentRequirementBody) {
    return this.documents.createRequirement(user, body);
  }

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Patch("document-requirements/:requirementId")
  patchRequirement(
    @CurrentUser() user: AuthUser,
    @Param("requirementId") requirementId: string,
    @Body() body: PatchDocumentRequirementBody,
  ) {
    return this.documents.patchRequirement(user, requirementId, body);
  }

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Get(":admissionId/documents")
  listDocuments(
    @CurrentUser() user: AuthUser,
    @Param("admissionId") admissionId: string,
  ) {
    return this.documents.list(user, admissionId);
  }

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Post(":admissionId/documents")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadDocument(
    @CurrentUser() user: AuthUser,
    @Param("admissionId") admissionId: string,
    @UploadedFile()
    file?: { originalname: string; mimetype: string; buffer: Buffer; size: number },
    @Body("requirementId") requirementId?: string,
  ) {
    if (!file) {
      throw new BadRequestException("Campo multipart `file` é obrigatório");
    }
    return this.documents.upload(
      user,
      admissionId,
      file,
      typeof requirementId === "string" ? requirementId : undefined,
    );
  }

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Get(":admissionId/documents/:documentId")
  async downloadDocument(
    @CurrentUser() user: AuthUser,
    @Param("admissionId") admissionId: string,
    @Param("documentId") documentId: string,
    @Res({ passthrough: false }) res: Response,
  ) {
    const file = await this.documents.download(user, admissionId, documentId);
    res.setHeader("Content-Type", file.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.displayName.replace(/"/g, "")}"`,
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(file.bytes);
  }

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Delete(":admissionId/documents/:documentId")
  @HttpCode(200)
  deleteDocument(
    @CurrentUser() user: AuthUser,
    @Param("admissionId") admissionId: string,
    @Param("documentId") documentId: string,
  ) {
    return this.documents.remove(user, admissionId, documentId);
  }

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Get(":admissionId")
  get(@CurrentUser() user: AuthUser, @Param("admissionId") admissionId: string) {
    return this.admissions.getById(user, admissionId);
  }

  @Roles(ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN)
  @Post(":admissionId/cancel")
  cancel(
    @CurrentUser() user: AuthUser,
    @Param("admissionId") admissionId: string,
    @Body() body?: { notes?: string },
  ) {
    return this.admissions.cancel(user, admissionId, body?.notes);
  }

  @Roles(
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.PLATFORM_ADMIN,
  )
  @Post(":admissionId/advance")
  advance(
    @CurrentUser() user: AuthUser,
    @Param("admissionId") admissionId: string,
    @Body() body: AdvanceAdmissionBody,
  ) {
    return this.admissions.advance(user, admissionId, body);
  }
}
