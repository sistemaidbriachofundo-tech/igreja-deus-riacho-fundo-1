"use client";

import { useEffect, useState } from "react";
import { ApiRequestError, apiGet } from "../../lib/api";
import type { FormalMember } from "../../lib/ministry-desk";
import { SecretaryDossier } from "../SecretaryDossier";
import { Alert } from "../ui/Alert";
import { Modal } from "../ui/Modal";
import s from "./ministry-home.module.css";

type Props = {
  token: string;
  ministryId: string;
  member: FormalMember;
  roles: readonly string[];
  onClose: () => void;
};

export function MinistryPersonDialog(props: Props) {
  const { roles } = props;
  const canEdit = roles.some(role => role === "PLATFORM_ADMIN" || role === "SECRETARIA");
  if (canEdit || roles.includes("PASTOR")) return <ChurchPersonDialog {...props} canEdit={canEdit} />;
  return <TeamPersonDialog {...props} />;
}

function ChurchPersonDialog({ token, member, canEdit, onClose }: Props & { canEdit: boolean }) {
  const [households, setHouseholds] = useState<Array<{ id: string; label: string }>>([]);
  useEffect(() => {
    if (!canEdit) return;
    let current = true;
    void apiGet<{ households: Array<{ id: string; label: string }> }>("/households", token)
      .then(result => { if (current) setHouseholds(result.households); })
      .catch(() => {});
    return () => { current = false; };
  }, [token, canEdit]);
  return <SecretaryDossier token={token} personId={member.personId} households={households} canEdit={canEdit}
    canReadDocuments credential={{ known: false }} onClose={onClose} onSessionExpired={onClose}
    onHouseholdCreated={canEdit ? household => setHouseholds(current => [household, ...current]) : undefined} />;
}

function TeamPersonDialog({ token, ministryId, member, onClose }: Props) {
  const [contact, setContact] = useState<{ email: string | null; address: string | null } | null>(null);
  const [failure, setFailure] = useState("");
  useEffect(() => {
    if (member.status === "ENCERRADO") {
      setFailure("O vínculo com esta equipe está encerrado.");
      return;
    }
    let current = true;
    const path = `/ministry-scope/${encodeURIComponent(ministryId)}/formal-memberships/${encodeURIComponent(member.id)}/person`;
    void apiGet<{ person: { email: string | null; address: string | null } }>(path, token)
      .then(result => { if (current) setContact(result.person); })
      .catch(error => {
        if (current) setFailure(error instanceof ApiRequestError && error.status === 403
          ? "Seu perfil não tem acesso aos dados de contato desta pessoa."
          : "Os dados de contato estão indisponíveis nesta consulta.");
      });
    return () => { current = false; };
  }, [token, ministryId, member.id, member.status]);
  return (
    <Modal open appearance="workspace" title={member.displayName} onClose={onClose}>
      <dl className={s.personDetails}>
        <div><dt>Vínculo na equipe</dt><dd>{member.role === "LIDER" ? "Liderança" : member.role === "COORDENADOR" ? "Coordenação" : member.role === "APOIO" ? "Apoio" : "Integrante"}</dd></div>
        {contact && <><div><dt>E-mail</dt><dd>{contact.email || "Sem e-mail cadastrado"}</dd></div>
          <div><dt>Endereço</dt><dd>{contact.address || "Sem endereço cadastrado"}</dd></div></>}
      </dl>
      {!contact && !failure && <p role="status">Consultando contato…</p>}
      {failure && <Alert appearance="workspace" tone="warning" title={failure} />}
      <p className={s.personNote}>A Secretaria pode atualizar o cadastro.</p>
    </Modal>
  );
}
