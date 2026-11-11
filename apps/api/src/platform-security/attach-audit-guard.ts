import { getRequestId } from "./request-context";
import { sanitizeAuditCreateData } from "@idbrf/shared";

const APPEND_ONLY = "audit_logs are append-only";

interface AuditQuery {
  args: { data?: Record<string, unknown> };
  query: (args: { data?: Record<string, unknown> }) => Promise<unknown>;
}

export interface AuditGuardExtension {
  query: {
    auditLog: {
      create: (query: AuditQuery) => Promise<unknown>;
      update: () => Promise<never>;
      updateMany: () => Promise<never>;
      delete: () => Promise<never>;
      deleteMany: () => Promise<never>;
      upsert: () => Promise<never>;
    };
  };
}

export interface AuditGuardClient {
  auditLog: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
  $transaction: (...args: unknown[]) => Promise<unknown>;
  $extends: (extension: AuditGuardExtension) => {
    auditLog: AuditGuardClient["auditLog"];
    $transaction: AuditGuardClient["$transaction"];
  };
}

/**
 * Cobre auth, pessoas, admissões, credenciais, ministérios, escalas,
 * tesouraria, financeiro e CMS: todos gravam por auditLog.create.
 * A sanitização acontece antes do INSERT. UPDATE e DELETE são recusados.
 */
export function attachAuditWriteGuard(client: AuditGuardClient): void {
  const extended = client.$extends({
    query: {
      auditLog: {
        async create({ args, query }) {
          const data = { ...(args.data ?? {}) };
          if (data.requestId == null) {
            const requestId = getRequestId();
            if (requestId) data.requestId = requestId;
          }
          return query({
            ...args,
            data: sanitizeAuditCreateData(data) as unknown as Record<string, unknown>,
          });
        },
        async update() {
          throw new Error(APPEND_ONLY);
        },
        async updateMany() {
          throw new Error(APPEND_ONLY);
        },
        async delete() {
          throw new Error(APPEND_ONLY);
        },
        async deleteMany() {
          throw new Error(APPEND_ONLY);
        },
        async upsert() {
          throw new Error(APPEND_ONLY);
        },
      },
    },
  });

  Object.defineProperty(client, "auditLog", {
    configurable: true,
    enumerable: true,
    get() {
      return extended.auditLog;
    },
  });
  client.$transaction = ((...args: unknown[]) => extended.$transaction(...args)) as AuditGuardClient["$transaction"];
}
