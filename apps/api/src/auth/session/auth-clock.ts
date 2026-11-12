import { Injectable } from "@nestjs/common";

/** Relógio injetável para expiração de sessão, desafio e JWT. */
@Injectable()
export class AuthClock {
  now(): number {
    return Date.now();
  }
}
