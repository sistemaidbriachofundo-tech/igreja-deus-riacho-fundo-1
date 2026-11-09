"use client";

import { useEffect, useState } from "react";
import { getApiBaseUrl, loadStoredToken } from "../lib/api";
import {
  loadMinistryDesk,
  requestInterestConversion,
  type ConversionResult,
  type DeskResult,
} from "../lib/ministry-desk";
import { MinistryMembershipCatalog } from "./MinistryMembershipCatalog";
import styles from "./ministry-membership-catalog.module.css";

export function MinistryDeskPage() {
  const [token, setToken] = useState<string | null>(null);
  const [ministryId, setMinistryId] = useState<string | undefined>(undefined);
  const [desk, setDesk] = useState<DeskResult | null>(null);
  const [conversion, setConversion] = useState<ConversionResult | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setToken(loadStoredToken());
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setDesk(null);
    void loadMinistryDesk({
      token,
      baseUrl: getApiBaseUrl(),
      ministryId,
    })
      .then((next) => {
        if (!cancelled) setDesk(next);
      })
      .catch(() => {
        if (!cancelled) {
          setDesk({
            kind: "error",
            message: "A consulta dos ministérios autorizados não respondeu.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, ministryId, reloadKey]);

  async function convert(interestId: string) {
    if (!token || !desk || desk.kind !== "ready" || convertingId) return;
    setConvertingId(interestId);
    setConversion(null);
    try {
      const result = await requestInterestConversion({
        token,
        baseUrl: getApiBaseUrl(),
        ministryId: desk.ministry.id,
        volunteerInterestId: interestId,
      });
      setConversion(result);
    } catch {
      setConversion({
        created: false,
        status: 0,
        code: "MINISTRY_INTEREST_CONVERSION_BLOCKED",
        message: "A conversão não foi concluída. Nenhum integrante foi criado.",
        member: null,
      });
    } finally {
      setConvertingId(null);
    }
  }

  return (
    <div>
      {!token ? (
        <section className={styles.desk}>
          <h1>Integrantes do ministério</h1>
          <p className={styles.lede}>A sessão ainda não está disponível nesta página.</p>
        </section>
      ) : null}
      {token && !desk ? (
        <section className={styles.desk} role="status">
          <h1>Integrantes do ministério</h1>
          <p className={styles.lede}>Consultando somente os ministérios autorizados…</p>
        </section>
      ) : null}
      {desk?.kind === "ready" ? (
        <MinistryMembershipCatalog
          desk={desk}
          conversion={conversion}
          convertingId={convertingId}
          onSelect={(id) => {
            setConversion(null);
            setMinistryId(id);
          }}
          onConvert={(id) => void convert(id)}
        />
      ) : null}
      {desk && desk.kind !== "ready" ? (
        <section className={styles.desk} aria-labelledby="desk-status-title">
          <p className={styles.kicker}>MINISTÉRIOS · VÍNCULO FORMAL</p>
          <h1 id="desk-status-title">
            {desk.kind === "denied" ? desk.ministry.name : "Integrantes do ministério"}
          </h1>
          <div className={desk.kind === "denied" ? styles.banner : styles.blocked} role={desk.kind === "error" || desk.kind === "denied" ? "alert" : "status"}>
            <strong>
              {desk.kind === "denied" ? `403 · ${desk.code}` : "BLOCKED"}
            </strong>
            <p>{desk.message}</p>
          </div>
          {desk.kind === "denied" ? (
            <p className={styles.lede}>
              Integrantes, interesses, agenda e saldo deste ministério não são exibidos.
            </p>
          ) : null}
          <button type="button" className={styles.refresh} onClick={() => setReloadKey((value) => value + 1)}>
            Consultar de novo
          </button>
        </section>
      ) : null}
    </div>
  );
}
