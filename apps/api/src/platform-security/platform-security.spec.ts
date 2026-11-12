import type { Prisma } from "@prisma/client";
import { withAuditWriteGuard, type AuditGuardExtension } from "./attach-audit-guard";
import { AuditWriterService } from "./audit-writer.service";
import { requestContext } from "./request-context";
import { resolveTrustProxyHops } from "./trusted-proxy";

describe("guarda de escrita da auditoria", () => {
  it("sanitiza o insert, copia o request id e recusa mutação", async () => {
    let captured: AuditGuardExtension | undefined;
    const stored: unknown[] = [];
    const client: {
      auditLog: {
        create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
      };
      $transaction: (...args: unknown[]) => Promise<unknown>;
      $extends: (extension: AuditGuardExtension) => {
        auditLog: {
          create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
        };
        $transaction: (...args: unknown[]) => Promise<unknown>;
      };
    } = {
      auditLog: {
        create: async () => {
          throw new Error("raw audit write");
        },
      },
      $transaction: async () => "base",
      $extends(extension: AuditGuardExtension) {
        captured = extension;
        return {
          auditLog: {
            create: (args: { data: Record<string, unknown> }) =>
              extension.query.auditLog.create({
                args,
                query: async (next) => {
                  stored.push(next.data);
                  return { id: "audit-1" };
                },
              }),
          },
          $transaction: async () => "extended",
        };
      },
    };
    const guarded = withAuditWriteGuard(client);
    await requestContext.run({ requestId: "req-abcdefgh" }, async () => {
      await guarded.auditLog.create({
        data: {
          action: "finance.entry",
          resourceType: "ledger",
          metadata: { amountCents: 100, password: "nao-gravar" },
        },
      });
    });
    expect(JSON.stringify(stored)).not.toContain("nao-gravar");
    expect(stored[0]).toMatchObject({
      action: "finance.entry",
      resourceType: "ledger",
      requestId: "req-abcdefgh",
      metadata: { amountCents: 100 },
    });
    await expect(captured?.query.auditLog.update()).rejects.toThrow("append-only");
    await expect(captured?.query.auditLog.delete()).rejects.toThrow("append-only");
    await expect(guarded.$transaction()).resolves.toBe("extended");
    await expect(client.$transaction()).resolves.toBe("base");
  });
});

describe("AuditWriterService", () => {
  it("grava só o evento saneado na transação informada", async () => {
    const created: unknown[] = [];
    const tx = {
      auditLog: {
        create: async (args: { data: Prisma.AuditLogUncheckedCreateInput }) => {
          created.push(args.data);
          return { id: "1" };
        },
      },
    };
    const service = new AuditWriterService({} as never);
    await service.write(
      {
        action: "credential.revoke",
        resourceType: "credential",
        metadata: { status: "REVOKED", token: "opaco" },
      },
      tx,
    );
    expect(JSON.stringify(created)).not.toContain("opaco");
    expect(created[0]).toMatchObject({
      action: "credential.revoke",
      metadata: { status: "REVOKED" },
    });
  });
});

describe("proxy confiável", () => {
  it("só confia no número explícito de saltos fora da Vercel", () => {
    expect(resolveTrustProxyHops({})).toBe(0);
    expect(resolveTrustProxyHops({ TRUST_PROXY: "0" })).toBe(0);
    expect(resolveTrustProxyHops({ TRUST_PROXY: "1" })).toBe(1);
    expect(resolveTrustProxyHops({ VERCEL: "1" })).toBe(1);
    expect(resolveTrustProxyHops({ TRUST_PROXY: "2", VERCEL: "1" })).toBe(2);
  });
});
