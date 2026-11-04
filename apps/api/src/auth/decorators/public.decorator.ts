import { SetMetadata } from "@nestjs/common";
import { IS_PUBLIC_KEY } from "../auth.constants";

/** Rota acessível sem JWT (ex.: health, login). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
