import { ForbiddenException } from "@nestjs/common";
import type { AuthUser } from "../auth/types/auth-user";
import { MinistriesService } from "./ministries.service";

const pilot = { organizationId: "org", churchId: "riacho" };

function user(personId: string): AuthUser {
  return { userId: personId, personId, email: `${personId}@example.test`, grants: [{ roleCode: "LIDER_MINISTERIO", organizationId: "org", churchId: "riacho", ministryId: "atmosfera" }] } as AuthUser;
}

function build() {
  const rules = { couples: [["ana", "bruno"]], qualifications: { diaconia: ["gabi"] } };
  let stored = rules;
  const db = {
    ministry: { findFirst: async () => ({ id: "atmosfera", organizationId: "org", churchId: "riacho", leaderPersonId: "lider-ministerio" }) },
    ministryRosterModuleLeader: { findMany: async ({ where }: { where: { personId: string } }) => where.personId === "lider-recepcao" ? [{ moduleId: "recepcao" }] : [] },
    ministryRosterModule: {
      findFirst: async ({ where }: { where: { id: string } }) => where.id === "recepcao" || where.id === "conexao" ? { id: where.id, name: where.id === "recepcao" ? "Recepção" : "Conexão", rules: stored } : null,
      update: async ({ data }: { data: { rules: typeof stored } }) => { stored = data.rules; return { id: "recepcao" }; },
    },
    auditLog: { create: async () => ({}) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return { service: new MinistriesService(db as never, { getPilotChurch: async () => pilot } as never), read: () => stored };
}

describe("quantidade futura do módulo", () => {
  it("deixa o líder do módulo ajustar só a própria equipe", async () => {
    const { service, read } = build();
    const leader = user("lider-recepcao");
    await expect(service.moduleCapacity(leader, "atmosfera", "conexao")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.moduleCapacity(leader, "atmosfera", "recepcao")).resolves.toMatchObject({ capacities: { sunday_morning: 3 } });
    await expect(service.updateModuleCapacity(leader, "atmosfera", "recepcao", "sunday_morning", 5)).resolves.toMatchObject({ capacities: { sunday_morning: 5, thursday_evening: 3 } });
    expect(read()).toMatchObject({ couples: [["ana", "bruno"]], qualifications: { diaconia: ["gabi"] } });
    await expect(service.updateModuleCapacity(user("lider-ministerio"), "atmosfera", "conexao", "thursday_evening", 4)).resolves.toMatchObject({ capacities: { thursday_evening: 4 } });
  });
});
