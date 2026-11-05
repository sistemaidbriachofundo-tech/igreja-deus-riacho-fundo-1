"use client";

import { useEffect, useState } from "react";
import { initialMembers, isMembersDataset, SYNTHETIC_STORE_KEY, type Member } from "./church-synthetic";

/** Uma única fonte local de registros ilustrativos. Substituir pela API HML após homologação. */
export function useChurchRecords() {
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SYNTHETIC_STORE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isMembersDataset(parsed)) setMembers(parsed);
      }
    } catch { /* uso seguro dos dados iniciais se o armazenamento estiver inválido */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(SYNTHETIC_STORE_KEY, JSON.stringify(members));
    } catch { /* dispositivo sem armazenamento persistente */ }
  }, [hydrated, members]);

  const reset = () => setMembers(initialMembers());
  return { members, setMembers, reset, hydrated };
}
