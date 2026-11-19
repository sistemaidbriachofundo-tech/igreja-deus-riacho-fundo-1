"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../lib/api";
import { dasError } from "../../lib/das-operations";
import { pendingTeamInvitations, rosterRouteUnavailable, type TeamInvitation } from "../../lib/roster-invitations";
import { useActionConfirmation } from "../ui/ActionConfirmation";
import s from "./member-schedule.module.css";

export function ServingTeamInvitations({ token, onAccepted }: { token: string; onAccepted: () => void }) {
  const [items, setItems] = useState<TeamInvitation[]>([]);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const { confirm, confirmation } = useActionConfirmation();

  useEffect(() => {
    let current = true;
    void apiGet<{ invitations: TeamInvitation[] }>("/rosters/membership-invitations/me", token).then(result => {
      const pending = pendingTeamInvitations(result);
      if (current) setItems(pending);
    }).catch(failure => {
      if (current && !rosterRouteUnavailable(failure)) setError(dasError(failure));
    });
    return () => { current = false; };
  }, [token]);

  async function respond(invite: TeamInvitation, accept: boolean) {
    if (busy || !(await confirm({
      title: accept ? "Entrar nesta equipe?" : "Recusar convite para a equipe?",
      subject: invite.moduleName,
      description: accept ? "A liderança será avisada do seu aceite." : "A liderança receberá sua resposta.",
      action: accept ? "Aceitar convite" : "Recusar convite",
    }))) return;
    setBusy(invite.id);
    setError("");
    setNotice("");
    try {
      await apiPost("/rosters/membership-invitations/" + encodeURIComponent(invite.id) + (accept ? "/accept" : "/decline"), token);
      setItems(current => current.filter(item => item.id !== invite.id));
      setNotice(accept ? "Convite aceito. Você faz parte da equipe." : "Convite recusado.");
      if (accept) onAccepted();
    } catch (failure) {
      setError(dasError(failure));
    } finally {
      setBusy("");
    }
  }

  if (!items.length && !error && !notice) return null;
  return <section className={s.teamInvites} aria-label="Convites para equipes">
    {confirmation}
    <h2>Convites para equipes</h2>
    {items.map(invite => <article key={invite.id}><strong>{invite.moduleName || "Equipe do ministério"}</strong>
      <div className={s.actions}>
        <button type="button" className={s.primary} disabled={Boolean(busy)} onClick={() => void respond(invite, true)}>Aceitar convite</button>
        <button type="button" className={s.secondary} disabled={Boolean(busy)} onClick={() => void respond(invite, false)}>Recusar convite</button>
      </div>
    </article>)}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
