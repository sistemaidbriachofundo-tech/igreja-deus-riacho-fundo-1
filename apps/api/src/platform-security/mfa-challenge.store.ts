import { Injectable } from "@nestjs/common";
import { MfaChallengeService } from "@idbrf/shared/security";
import { PrismaMfaChallengeRepository } from "./prisma-mfa-challenge.repository";

@Injectable()
export class MfaChallengeStore {
  readonly challenges: MfaChallengeService;

  constructor(repository: PrismaMfaChallengeRepository) {
    this.challenges = new MfaChallengeService(repository);
  }
}
