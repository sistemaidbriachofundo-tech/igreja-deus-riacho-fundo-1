import { AuditImmutableError } from "./audit-command";
import { lockAuditDelegate } from "./audit-append-only";

describe("audit append-only guard", () => {
  it("rejects application update and delete and leaves create in place", async () => {
    const create = jest.fn();
    const delegate: Record<string, unknown> = {
      create,
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    };
    lockAuditDelegate(delegate);
    await expect(
      (delegate.update as () => Promise<unknown>)(),
    ).rejects.toBeInstanceOf(AuditImmutableError);
    await expect(
      (delegate.delete as () => Promise<unknown>)(),
    ).rejects.toBeInstanceOf(AuditImmutableError);
    await expect(
      (delegate.upsert as () => Promise<unknown>)(),
    ).rejects.toBeInstanceOf(AuditImmutableError);
    (delegate.create as () => void)();
    expect(create).toHaveBeenCalledTimes(1);
  });
});
