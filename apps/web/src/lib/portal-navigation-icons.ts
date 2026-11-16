import type { GlyphName } from "../components/ui/UIIcon";

export const portalNavigationIcons = { inicio: "home", "quem-somos": "people", agenda: "calendar" } as const satisfies Record<string, GlyphName>;
