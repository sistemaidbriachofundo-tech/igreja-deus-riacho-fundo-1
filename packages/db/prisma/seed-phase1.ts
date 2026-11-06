import type { PrismaClient } from "@prisma/client";
import { generateOpaqueCredentialToken } from "@idbrf/shared";

/**
 * Massa repetível exclusivamente para HML Fase 1.
 * Nenhuma pessoa, e-mail, evento ou família corresponde a dados oficiais.
 * IDs próprios e atualização vazia evitam apagar alterações feitas durante testes.
 */
export async function seedPhase1Mass(
  prisma: PrismaClient,
  organizationId: string,
  churchId: string,
  issuedByUserId: string,
): Promise<{ people: number; families: number; active: number; pending: number; visitors: number }> {
  if (process.env.SEED_HML_MASS !== "true") {
    throw new Error("Massa Fase 1 exige SEED_HML_MASS=true");
  }
  const firstNames = [
    "Alice","Bruno","Cecília","Davi","Elisa","Felipe","Gabriela","Heitor","Isabela","João",
    "Kamila","Leonardo","Marina","Nicolas","Olívia","Pedro","Quitéria","Rafael","Sofia","Tiago",
    "Úrsula","Vinícius","Wesley","Yasmin","Zoe","Amanda","Breno","Carolina","Diego","Ester",
    "Flávia","Guilherme","Helena","Igor","Júlia","Lucas","Maitê","Noah","Paula","Ricardo",
    "Sabrina","Tomás","Valéria","William","Yara","André","Bianca","Caio","Débora","Enzo",
    "Fernanda","Gustavo",
  ];
  const families: string[] = [];
  for (let i = 1; i <= 15; i++) {
    const id = "hml-f1-familia-" + String(i).padStart(2,"0");
    const family = await prisma.household.upsert({
      where: { id }, update: {},
      create: { id, organizationId, churchId, label: "Família Modelo " + String(i).padStart(2,"0") + " (fictícia)" },
    });
    families.push(family.id);
  }
  for (let idx = 0; idx < firstNames.length; idx++) {
    const serial = String(idx+1).padStart(2,"0");
    const id = "hml-f1-pessoa-"+serial;
    const active = idx < 25;
    const pending = idx >= 25 && idx < 37;
    const inactive = idx >= 47;
    const person = await prisma.person.upsert({
      where: { id },
      update: {},
      create: {
        id, organizationId, homeChurchId: churchId,
        householdId: families[idx%families.length],
        displayName: firstNames[idx] + " Exemplo " + serial + " (fictício)",
        email: "fase1.pessoa"+serial+"@example.test",
        kind: active || inactive ? "MEMBER" : "VISITOR",
        status: inactive ? "INACTIVE" : "ACTIVE",
      },
    });
    if (!active && !pending && !inactive) continue;
    const membership = await prisma.churchMembership.upsert({
      where: { personId_churchId: { personId: person.id, churchId } },
      update: {},
      create: {
        personId: person.id, organizationId, churchId,
        status: active ? "ACTIVE" : pending ? "PENDING_ADMISSION" : "INACTIVE",
        notes: "Dado sintético de homologação — sem validade institucional.",
      },
    });
    if (!active && !pending) continue;
    const phase = idx % 3;
    const status = active ? "APPROVED" :
      phase === 0 ? "AWAITING_DOCUMENTS" :
      phase === 1 ? "AWAITING_SECRETARIA" : "AWAITING_PASTOR";
    const currentStep = active ? "pastor" : phase === 0 ? "documents" : phase === 1 ? "secretaria" : "pastor";
    const modality = idx % 4 === 0 ? "TRANSFERENCIA" : idx % 4 === 1 ? "RECONCILIACAO" : "BATISMO";
    await prisma.admissionProtocol.upsert({
      where: { id: "hml-f1-admissao-"+serial },
      update: {},
      create: {
        id: "hml-f1-admissao-"+serial,
        personId: person.id,
        membershipId: membership.id,
        organizationId, churchId,
        status, modality, currentStep,
        modalityRecorded: true,
        documentsComplete: active || phase > 0,
        secretariaApproved: active || phase > 1,
        pastorApproved: active,
        notes: "Protocolo exclusivamente fictício para validar etapas e perfis.",
      },
    });
    if (active && idx % 4 !== 0) {
      const existing = await prisma.memberCredential.findFirst({
        where: { membershipId: membership.id, status: "ACTIVE" },
        select: { id:true },
      });
      if (!existing) {
        await prisma.memberCredential.create({
          data: {
            membershipId: membership.id, personId: person.id,
            organizationId, churchId, status: "ACTIVE",
            opaqueToken: generateOpaqueCredentialToken(),
            issuedByUserId,
          },
        });
      }
    }
  }
  return { people: firstNames.length, families: families.length, active:25, pending:12, visitors:10 };
}
