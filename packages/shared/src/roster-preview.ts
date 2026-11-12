export type RosterPreviewPosition = {
  slotId: string;
  roleLabel: string;
  personName: string | null;
  partnerName: string | null;
  reasons: string[];
};

export type RosterPreviewDto = {
  rosterId: string;
  positions: RosterPreviewPosition[];
};
