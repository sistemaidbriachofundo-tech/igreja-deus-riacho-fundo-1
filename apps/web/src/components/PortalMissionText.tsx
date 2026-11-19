import { defaultSiteLayout, portalMissionLines } from "../lib/site-layout";
import s from "./portal-mission-text.module.css";

export function PortalMissionText({ text }: { text: string }) {
  if (text !== defaultSiteLayout.hero.description) return text;

  return (
    <span className={s.statement}>
      {portalMissionLines.map((line, index) => (
        <span key={line} className={s.line}>{line}{index < portalMissionLines.length - 1 ? " " : null}</span>
      ))}
    </span>
  );
}
