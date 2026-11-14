import { ConflictException, Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService, type PilotChurch } from "../pilot/pilot.service";
import { PrivateStorageService } from "../storage/private-storage.service";
import { hashPassword, verifyPassword } from "../auth/auth.service";
import { authLimits } from "../auth/login/auth-limits";
import type { AuthAttemptLimiter } from "../auth/login/auth-attempt-limiter";
import { assertPasswordPolicy } from "../auth/password-policy";
import { AUTH_ATTEMPT_LIMITER, SESSION_STORE } from "../auth/session/auth-state.tokens";
import type { SessionStore } from "../auth/session/session-store";
import type { AuthUser } from "../auth/types/auth-user";
import { BusinessException } from "../common/business.exception";
import { jpegPortrait } from "../persons/person-photo";
import { normalizeAccountPhone } from "./account-phone";
import { normalizeProfilePhoto } from "./account-photo";

export interface AccountProfile {
  name: string | null;
  email: string;
  phone: string | null;
  photoPath: string | null;
  canEditProfilePhoto: boolean;
}

const PHOTO_PATH = "/account/me/photo";

interface LinkedPerson {
  id: string;
  organizationId: string;
  homeChurchId: string;
  displayName: string;
  phone: string | null;
  photoStorageKey: string | null;
  hasPhoto: boolean;
}

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
    private readonly storage: PrivateStorageService,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(AUTH_ATTEMPT_LIMITER) private readonly attempts: AuthAttemptLimiter,
  ) {}

  async getProfile(actor: AuthUser): Promise<AccountProfile> {
    const loaded = await this.loadPerson(actor);
    if (!loaded.linked) {
      return {
        name: null,
        email: loaded.email,
        phone: null,
        photoPath: null,
        canEditProfilePhoto: false,
      };
    }
    return this.toProfile(loaded.email, loaded.linked);
  }

  /**
   * Só `phone`. E-mail de login não muda aqui: isso depende do fluxo de verificação.
   * Sem pessoa autorizada na congregação da sessão, a resposta é 409.
   */
  async updatePhone(actor: AuthUser, phone: string | null): Promise<AccountProfile> {
    const linked = await this.requireLinked(actor);
    const normalized = normalizeAccountPhone(phone);
    const updated = await this.prisma.person.updateMany({
      where: {
        id: linked.id,
        organizationId: linked.organizationId,
        homeChurchId: linked.homeChurchId,
      },
      data: { phone: normalized },
    });
    if (updated.count !== 1) {
      throw unlinked();
    }
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "account.phone.update",
        resourceType: "person",
        resourceId: linked.id,
        organizationId: linked.organizationId,
        churchId: linked.homeChurchId,
        metadata: { cleared: normalized === null },
      },
    });
    return this.getProfile(actor);
  }

  async changePassword(
    actor: AuthUser,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const key = `account-password:${actor.userId}`;
    const limit = authLimits.loginFailures();
    const windowMs = authLimits.loginWindowMs();
    await this.attempts.assertAllowed(key, limit, windowMs);
    const user = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { id: true, email: true, passwordHash: true, personId: true },
    });
    const currentOk = Boolean(
      user &&
        user.personId === actor.personId &&
        user.email === actor.email &&
        (await verifyPassword(currentPassword, user.passwordHash)),
    );
    if (!user || !currentOk) {
      await this.attempts.recordFailure(key, windowMs);
      throw new BusinessException(
        "Senha atual não confere.",
        "ACCOUNT_PASSWORD_CURRENT_INVALID",
        400,
      );
    }
    if (await verifyPassword(newPassword, user.passwordHash)) {
      throw new BusinessException(
        "Escolha uma senha diferente da atual.",
        "ACCOUNT_PASSWORD_REUSE",
        400,
      );
    }
    assertPasswordPolicy(newPassword, user.email);
    const passwordHash = await hashPassword(newPassword);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: user.id, passwordHash: user.passwordHash },
        data: { passwordHash, authzVersion: { increment: 1 } },
      });
      if (updated.count !== 1) {
        throw new ConflictException("A senha foi alterada em outra sessão. Entre novamente.");
      }
      await tx.authSession.updateMany({
        where: { userId: user.id, status: "ACTIVE" },
        data: { status: "REVOKED", revokedAt: now, revokeReason: "password_change" },
      });
      await tx.mfaChallenge.updateMany({
        where: { userId: user.id, status: "PENDING" },
        data: { status: "REVOKED" },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: "account.password.change",
          resourceType: "user",
          resourceId: user.id,
          metadata: { sessionsRevoked: true },
        },
      });
    });
    await this.sessions.revokeAllForUser(user.id);
    await this.attempts.reset(key);
  }

  async replacePhoto(actor: AuthUser, bytes: Buffer): Promise<void> {
    const linked = await this.requireLinked(actor);
    const jpeg = await normalizeProfilePhoto(bytes);
    const storageKey = this.storage.buildPersonPhotoKey({
      organizationId: linked.organizationId,
      personId: linked.id,
      extension: "jpg",
    });
    const jpegBytes = new Uint8Array(jpeg);
    await this.storage.put(storageKey, jpeg);
    await this.prisma.$transaction(async (tx) => {
      await tx.personPhoto.upsert({
        where: { personId: linked.id },
        create: { personId: linked.id, jpeg: jpegBytes },
        update: { jpeg: jpegBytes },
      });
      const updated = await tx.person.updateMany({
        where: {
          id: linked.id,
          organizationId: linked.organizationId,
          homeChurchId: linked.homeChurchId,
        },
        data: { photoStorageKey: storageKey },
      });
      if (updated.count !== 1) throw unlinked();
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "account.photo.replace",
          resourceType: "person",
          resourceId: linked.id,
          organizationId: linked.organizationId,
          churchId: linked.homeChurchId,
          metadata: {
            sha256: createHash("sha256").update(jpeg).digest("hex"),
            byteSize: jpeg.length,
          },
        },
      });
    });
    if (linked.photoStorageKey && linked.photoStorageKey !== storageKey) {
      await this.storage.remove(linked.photoStorageKey).catch(() => undefined);
    }
  }

  /** Binário privado. Fotos já gravadas continuam válidas se forem JPEG da ficha. */
  async readPhoto(actor: AuthUser): Promise<Buffer> {
    const linked = await this.requireLinked(actor);
    const row = await this.prisma.personPhoto.findUnique({
      where: { personId: linked.id },
      select: { jpeg: true },
    });
    const stored = jpegPortrait(row?.jpeg);
    if (stored) return stored;
    if (linked.photoStorageKey) {
      try {
        const bytes = jpegPortrait(await this.storage.get(linked.photoStorageKey));
        if (bytes) return bytes;
      } catch {
        // A chave antiga pode apontar para um arquivo que já não existe.
      }
    }
    throw new BusinessException("Não há foto nesta conta.", "ACCOUNT_PHOTO_MISSING", 404);
  }

  private async requireLinked(actor: AuthUser): Promise<LinkedPerson> {
    const loaded = await this.loadPerson(actor);
    if (!loaded.linked) throw unlinked();
    return loaded.linked;
  }

  private async loadPerson(actor: AuthUser): Promise<{ email: string; linked: LinkedPerson | null }> {
    const pilot = await this.pilot.getPilotChurch();
    const user = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: {
        email: true,
        personId: true,
        person: {
          select: {
            id: true,
            displayName: true,
            phone: true,
            status: true,
            organizationId: true,
            homeChurchId: true,
            photoStorageKey: true,
            photo: { select: { personId: true } },
          },
        },
      },
    });
    const email = user?.email ?? actor.email;
    if (!user || user.personId !== actor.personId || !user.person) {
      return { email, linked: null };
    }
    if (!this.personIsInSessionChurch(user.person, actor, pilot)) {
      return { email, linked: null };
    }
    return {
      email,
      linked: {
        id: user.person.id,
        organizationId: user.person.organizationId,
        homeChurchId: user.person.homeChurchId as string,
        displayName: user.person.displayName,
        phone: user.person.phone,
        photoStorageKey: user.person.photoStorageKey,
        hasPhoto: Boolean(user.person.photo),
      },
    };
  }

  private personIsInSessionChurch(
    person: {
      status: string;
      organizationId: string;
      homeChurchId: string | null;
    },
    actor: AuthUser,
    pilot: PilotChurch,
  ): boolean {
    const churchId = actor.churchId ?? pilot.churchId;
    const organizationId = actor.organizationId ?? pilot.organizationId;
    return (
      person.status === "ACTIVE" &&
      person.organizationId === pilot.organizationId &&
      person.organizationId === organizationId &&
      person.homeChurchId === churchId &&
      person.homeChurchId === pilot.churchId
    );
  }

  private toProfile(email: string, person: LinkedPerson): AccountProfile {
    return {
      name: person.displayName,
      email,
      phone: person.phone,
      photoPath: person.hasPhoto ? PHOTO_PATH : null,
      canEditProfilePhoto: true,
    };
  }
}

function unlinked(): BusinessException {
  return new BusinessException(
    "Não há pessoa autorizada nesta congregação para editar a conta.",
    "ACCOUNT_PERSON_UNLINKED",
    409,
  );
}
