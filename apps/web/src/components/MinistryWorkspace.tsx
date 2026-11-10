"use client";

import { useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "../lib/api";
import { type DasRecord } from "../lib/das-operations";
import { loadMinistryDesk, type DeskResult } from "../lib/ministry-desk";
import { activeFormalMembers, ministryHref, ministryPanelTitle, roleLabel } from "../lib/ministry-view";
import { withBasePath } from "../lib/paths";
import { SyntheticAvatar } from "./ministry/ministry-visuals";
import styles from "./ministry-workspace.module.css";

type Props = { ministries: DasRecord[]; token: string };

const word = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export function MinistryWorkspace({ ministries, token }: Props) {
  const [chosenId, setChosenId] = useState("");
  const [desk, setDesk] = useState<DeskResult | null>(null);
  const options = useMemo(
    () =>
      ministries
        .map((row) => ({
          id: word(row.id),
          name: word(row.name) || "Ministério",
          slug: word(row.slug) || undefined,
        }))
        .filter((row) => row.id),
    [ministries],
  );
  const ministry = options.find((row) => row.id === chosenId) ?? options[0];
  const ministryId = ministry?.id ?? "";

  useEffect(() => {
    if (!token || !ministryId) {
      setDesk(null);
      return;
    }
    let cancelled = false;
    setDesk(null);
    void loadMinistryDesk({ token, baseUrl: getApiBaseUrl(), ministryId })
      .then((next) => {
        if (!cancelled) setDesk(next);
      })
      .catch(() => {
        if (!cancelled) setDesk({ kind: "error", message: "A equipe autorizada não respondeu." });
      });
    return () => {
      cancelled = true;
    };
  }, [token, ministryId]);

  const members = desk?.kind === "ready" && desk.membership.kind === "ready" ? desk.membership.members : null;
  const active = members ? activeFormalMembers(members) : null;
  const title = ministry ? ministryPanelTitle(ministry) : "Meu ministério";

  return (
    <section className={styles.workspace} aria-labelledby="my-ministry-title">
      <header className={styles.intro}>
        <span>Equipe autorizada</span>
        <h2 id="my-ministry-title">Meu ministério</h2>
        <p>
          O cadastro integral de participantes fica no painel do ministério e só lista quem tem vínculo formal.
          Interesse de voluntariado não entra nessa contagem.
        </p>
      </header>

      {!options.length ? (
        <p className={styles.empty} role="status">
          Nenhum ministério está associado a esta conta. Solicite à secretaria que revise suas permissões.
        </p>
      ) : (
        <>
          <div className={styles.cards}>
            {options.map((row) => {
              const label = ministryPanelTitle(row);
              const selected = row.id === ministryId;
              return (
                <article key={row.id} className={selected ? styles.cardOn : undefined}>
                  <span>{label}</span>
                  <strong>{row.name}</strong>
                  <a href={withBasePath(ministryHref(row.id, "visao"))}>Abrir {label}</a>
                </article>
              );
            })}
          </div>
          {options.length > 1 ? (
            <label className={styles.selector}>
              Ministério
              <select value={ministryId} onChange={(event) => setChosenId(event.target.value)}>
                {options.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <section className={styles.listPanel} aria-label="Integrantes formais">
            <div className={styles.panelHeading}>
              <h3>{title}</h3>
              <p>
                {active
                  ? active.length === 0
                    ? "Nenhum integrante formal. O convite fica no painel do ministério."
                    : `${active.length} ${active.length === 1 ? "integrante formal" : "integrantes formais"}.`
                  : desk?.kind === "ready"
                    ? "A contagem formal ainda não está disponível."
                    : "A contagem oficial abre com o painel do ministério."}
              </p>
            </div>
            {active && active.length > 0 ? (
              <div className={styles.people}>
                {active.slice(0, 6).map((member) => (
                  <div className={styles.person} key={member.id}>
                    <SyntheticAvatar name={member.displayName} />
                    <div>
                      <strong>{member.displayName}</strong>
                      <small>{roleLabel(member.role)}</small>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {ministry ? (
              <a className={styles.open} href={withBasePath(ministryHref(ministry.id, "integrantes"))}>
                Abrir {title}
              </a>
            ) : null}
          </section>
          <p className={styles.unavailable}>
            <strong>Saldo ainda não disponível</strong>
            <small>Não há leitura autorizada de caixa para o ministério. Nenhum valor é exibido.</small>
          </p>
        </>
      )}
    </section>
  );
}
