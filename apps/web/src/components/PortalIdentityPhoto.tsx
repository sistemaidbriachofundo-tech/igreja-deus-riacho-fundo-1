"use client";

import { SITE_IDENTITY_PHOTO } from "@idbrf/shared";
import { resolveSitePhoto } from "../lib/site-layout";
import { usePublishedSiteLayout } from "../lib/use-published-site-layout";

export function PortalIdentityPhoto() {
  const { identity = SITE_IDENTITY_PHOTO } = usePublishedSiteLayout();
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={resolveSitePhoto(identity.imageUrl)} alt={identity.alt} width={1000} height={1270} loading="lazy" />
  );
}
