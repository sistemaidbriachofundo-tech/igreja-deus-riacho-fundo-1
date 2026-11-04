import { SetMetadata } from "@nestjs/common";
import type { RoleCode } from "@idbrf/shared";
import { ROLES_KEY } from "../auth.constants";

/** Exige ao menos um dos papéis listados (RBAC). */
export const Roles = (...roles: RoleCode[]) => SetMetadata(ROLES_KEY, roles);
