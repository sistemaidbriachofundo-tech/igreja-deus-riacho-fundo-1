"use client";

import { Fragment, type ReactNode } from "react";
import { usePublishedSiteLayout } from "../lib/use-published-site-layout";
import type { SiteSection } from "../lib/site-layout";

type Props = Record<SiteSection,ReactNode>;
/** Preserva os componentes reais da Home; troca apenas a ordem editorial. */
export function PortalHomeSections(props:Props) {
  const layout = usePublishedSiteLayout();
  return <>
    {layout.sections.filter(key=>!layout.hidden.includes(key)).map(key=>
      <Fragment key={key}>{props[key]}</Fragment>
    )}
  </>;
}
