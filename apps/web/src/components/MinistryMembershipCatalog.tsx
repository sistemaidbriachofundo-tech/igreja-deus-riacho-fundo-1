"use client";

import type { ConversionResult, DeskReady, InterestRow } from "../lib/ministry-desk";
import styles from "./ministry-membership-catalog.module.css";

const roleLabel: Record<string, string> = {
  LIDER: "Liderança",
  COORDENADOR: "Coordenação",
  INTEGRANTE: "Integrante",
  APOIO: "Apoio",
};

const stageLabel: Record<string, string> = {
  INTERESSE: "Interesse recebido",
  AVALIACAO: "Em avaliação",
  APROVACAO: "Em aprovação",
  EQUIPE: "Etapa de equipe do voluntariado",
  DISPONIBILIDADE: "Disponibilidade informada",
  ESCALA: "Encaminhado à escala",
};

type Props = {
  desk: DeskReady;
  conversion: ConversionResult | null;
  convertingId: string | null;
  onSelect: (ministryId: string) => void;
  onConvert: (interestId: string) => void;
};

function initial(name: string) {
  return (name.trim().charAt(0) || "P").toLocaleUpperCase("pt-BR");
}

function Blocked({ code, message }: { code: string; message: string }) {
  return (
    <div className={styles.blocked} role="status">
      <strong>BLOCKED · {code}</strong>
      <p>{message}</p>
    </div>
  );
}

export function MinistryMembershipCatalog({
  desk,
  conversion,
  convertingId,
  onSelect,
  onConvert,
}: Props) {
  const memberCount =
    desk.membership.kind === "ready" ? String(desk.membership.members.length) : "BLOCKED";

  return (
    <div className={styles.desk}>
      <p className={styles.kicker}>MINISTÉRIOS · VÍNCULO FORMAL</p>
      <h1>Integrantes de {desk.ministry.name}</h1>
      <p className={styles.lede}>
        A lista autorizada vem da API. Um interesse de voluntariado, mesmo na etapa de equipe,
        não coloca a pessoa entre os integrantes. O saldo só aparece depois do contrato financeiro.
      </p>

      {desk.ministries.length > 1 ? (
        <label className={styles.selector}>
          Ministério autorizado
          <select
            value={desk.ministry.id}
            onChange={(event) => onSelect(event.target.value)}
          >
            {desk.ministries.map((ministry) => (
              <option key={ministry.id} value={ministry.id}>
                {ministry.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <ul className={styles.stats}>
        <li>
          <span>Ministério em escopo</span>
          <strong>{desk.ministry.name}</strong>
        </li>
        <li>
          <span>Integrantes formais</span>
          <strong>{memberCount}</strong>
        </li>
        <li>
          <span>Interesses, sem vínculo</span>
          <strong>{desk.interests.length}</strong>
        </li>
        <li>
          <span>Saldo do centro de custo</span>
          <strong>Oculto</strong>
        </li>
      </ul>

      <div className={styles.columns}>
        <section className={styles.panel} data-region="formal-members" aria-labelledby="formal-members-title">
          <h2 id="formal-members-title">Equipe formal</h2>
          <p>Somente pessoas com vínculo gravado no ministério. Esta coluna não copia interessados.</p>
          {desk.membership.kind === "ready" ? (
            desk.membership.members.length ? (
              <div className={styles.people}>
                {desk.membership.members.map((member) => (
                  <div className={styles.row} key={member.id}>
                    <span className={styles.mark} aria-hidden="true">{initial(member.displayName)}</span>
                    <div>
                      <strong>{member.displayName}</strong>
                      <small>{roleLabel[member.role] ?? member.role} · {member.status}</small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.schedule}>{desk.membership.message}</p>
            )
          ) : (
            <Blocked code={desk.membership.code} message={desk.membership.message} />
          )}
        </section>

        <section className={styles.panel} data-region="volunteer-interests" aria-labelledby="interests-title">
          <h2 id="interests-title">Interesses de voluntariado</h2>
          <p>{desk.interestsMessage}</p>
          {desk.interests.length === 0 ? (
            <p className={styles.schedule}>Nenhum interesse autorizado neste ministério.</p>
          ) : (
            <div className={styles.people}>
              {desk.interests.map((interest) => (
                <InterestLine
                  key={interest.id}
                  interest={interest}
                  busy={convertingId === interest.id}
                  onConvert={onConvert}
                />
              ))}
            </div>
          )}
          {conversion ? (
            <div className={conversion.created ? styles.schedule : styles.blocked} role="status">
              <strong>{conversion.created ? "Integrante registrado" : `BLOCKED · ${conversion.code}`}</strong>
              <p>{conversion.message}</p>
            </div>
          ) : null}
        </section>
      </div>

      <div className={styles.stack}>
        <section className={styles.panel} aria-labelledby="agenda-title">
          <h2 id="agenda-title">Agenda</h2>
          {desk.agenda.kind === "denied" ? (
            <Blocked code={desk.agenda.code} message={desk.agenda.message} />
          ) : (
            <>
              {desk.agenda.scheduleText ? (
                <p className={styles.schedule}>
                  Horário no perfil do ministério: {desk.agenda.scheduleText}
                </p>
              ) : (
                <p>O perfil deste ministério não informa horário livre.</p>
              )}
              <Blocked code={desk.agenda.code} message={desk.agenda.message} />
            </>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="requests-title">
          <h2 id="requests-title">Solicitações</h2>
          <Blocked code={desk.requests.code} message={desk.requests.message} />
        </section>

        <section className={styles.panel} data-region="finance" aria-labelledby="finance-title">
          <h2 id="finance-title">Centro de custo</h2>
          <p>A leitura espera o contrato da frente financeira. Nenhum valor é estimado aqui.</p>
          <Blocked code={desk.finance.code} message={desk.finance.message} />
        </section>
      </div>
    </div>
  );
}

function InterestLine({
  interest,
  busy,
  onConvert,
}: {
  interest: InterestRow;
  busy: boolean;
  onConvert: (interestId: string) => void;
}) {
  return (
    <div className={styles.row}>
      <span className={styles.mark} aria-hidden="true">{initial(interest.displayName)}</span>
      <div>
        <strong>{interest.displayName}</strong>
        <small>{stageLabel[interest.stage] ?? interest.stage} · não é integrante</small>
      </div>
      <span className={styles.tag}>Interesse</span>
      <button type="button" disabled={busy} onClick={() => onConvert(interest.id)}>
        {busy ? "Consultando conversão…" : "Pedir conversão controlada"}
      </button>
    </div>
  );
}
