import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { sanitizeAuditCreateData, type AuditWriteInput } from "@idbrf/shared";
import { PrismaService } from "../prisma/prisma.service";
import { getRequestId } from "./request-context";

interface AuditClient {
  auditLog: {
    create: (args: { data: Prisma.AuditLogUncheckedCreateInput }) => Promise<unknown>;
  };
}

/**
 * Escrita estruturada para a mesma transação da operação de negócio.
 * A frente B pode substituir a política; este caminho já impede segredo no INSERT.
 */
@Injectable()
export class AuditWriterService {
  constructor(private readonly prisma: PrismaService) {}

  async write(input: AuditWriteInput, tx?: AuditClient): Promise<unknown> {
    const data = sanitizeAuditCreateData({
      ...input,
      requestId: input.requestId ?? getRequestId() ?? null,
    }) as Prisma.AuditLogUncheckedCreateInput;
    const client = tx ?? this.prisma;
    return client.auditLog.create({ data });
  }
}
