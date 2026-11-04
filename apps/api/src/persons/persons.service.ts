import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { canSearchPersons } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";

@Injectable()
export class PersonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  async search(actor: AuthUser, q: string, limit = 10) {
    const pilot = await this.pilot.getPilotChurch();
    if (
      !canSearchPersons(actor.grants, {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      })
    ) {
      throw new ForbiddenException("Sem permissão para buscar pessoas");
    }

    const query = q.trim();
    if (query.length < 2) {
      return { query, hits: [], autoMergeForbidden: true as const };
    }

    const take = Math.min(Math.max(limit, 1), 50);
    const rows = await this.prisma.person.findMany({
      where: {
        organizationId: pilot.organizationId,
        OR: [
          { displayName: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
        ],
      },
      take,
      orderBy: { displayName: "asc" },
      select: {
        id: true,
        displayName: true,
        email: true,
        status: true,
        householdId: true,
        kind: true,
        isMinor: true,
      },
    });

    const qLower = query.toLowerCase();
    const hits = rows.map((person) => {
      const matchReasons: Array<"displayName" | "email"> = [];
      if (person.displayName.toLowerCase().includes(qLower)) {
        matchReasons.push("displayName");
      }
      if (person.email?.toLowerCase().includes(qLower)) {
        matchReasons.push("email");
      }
      const exactName = person.displayName.toLowerCase() === qLower;
      const exactEmail = person.email?.toLowerCase() === qLower;
      const score = exactEmail || exactName ? 0.95 : matchReasons.length > 1 ? 0.85 : 0.7;
      return {
        person: {
          id: person.id,
          displayName: person.displayName,
          email: person.email,
          status: person.status,
          householdId: person.householdId,
        },
        score,
        matchReasons,
      };
    });

    return { query, hits, autoMergeForbidden: true as const };
  }

  async getById(actor: AuthUser, personId: string) {
    const pilot = await this.pilot.getPilotChurch();
    if (
      !canSearchPersons(actor.grants, {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      })
    ) {
      throw new ForbiddenException("Sem permissão para consultar pessoa");
    }

    const person = await this.prisma.person.findFirst({
      where: {
        id: personId,
        organizationId: pilot.organizationId,
      },
      select: {
        id: true,
        displayName: true,
        email: true,
        status: true,
        householdId: true,
        kind: true,
        isMinor: true,
        legalGuardianPersonId: true,
      },
    });
    if (!person) {
      throw new NotFoundException("Pessoa não encontrada neste escopo");
    }
    return person;
  }
}
