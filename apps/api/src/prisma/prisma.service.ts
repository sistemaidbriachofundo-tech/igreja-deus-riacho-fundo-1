import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import {
  withAuditWriteGuard,
  type AuditGuardClient,
} from "../platform-security/attach-audit-guard";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super();
    // The Prisma extension follows transaction clients. Replacing the original
    // client's method causes Prisma's proxies to call themselves recursively.
    return withAuditWriteGuard(this as unknown as AuditGuardClient) as unknown as PrismaService;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
