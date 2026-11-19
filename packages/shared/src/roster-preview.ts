export type RosterPreviewPosition = {
  slotId: string;
  roleLabel: string;
  personName: string | null;
  partnerName: string | null;
  reasons: string[];
  openVacancy?: string;
};

export type RosterPreviewDto = {
  rosterId: string;
  positions: RosterPreviewPosition[];
  fingerprint?: string;
};
