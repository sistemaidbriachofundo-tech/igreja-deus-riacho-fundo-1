import type { ReactNode } from "react";
import Link from "next/link";
import { PortalGlyph, type PortalGlyphName } from "./PortalGlyph";
import s from "./portal-design-system.module.css";

export type PortalButtonVariant = "gold" | "glass" | "text";
export function PortalButton({href,children,variant="gold",icon,className="",label}:{
  href:string;children:ReactNode;variant?:PortalButtonVariant;icon?:PortalGlyphName;className?:string;label?:string;
}) {
  const tone=variant==="gold"?s.goldButton:variant==="glass"?s.glassButton:s.textButton;
  return <Link href={href} aria-label={label} className={[s.systemButton,tone,className].filter(Boolean).join(" ")}>
    {icon&&<PortalGlyph name={icon} width={19} height={19}/>}
    <span>{children}</span>
    <PortalGlyph name="arrow" width={18} height={18}/>
  </Link>;
}
