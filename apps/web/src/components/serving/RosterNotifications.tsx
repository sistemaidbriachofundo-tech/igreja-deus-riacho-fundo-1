"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, ApiRequestError } from "../../lib/api";
import { dasError } from "../../lib/das-operations";
import { withBasePath } from "../../lib/paths";
import { UIIcon } from "../ui/UIIcon";
import { useActionConfirmation } from "../ui/ActionConfirmation";
import styles from "./serving.module.css";

const PATH = "/rosters/notifications";
const inviteDeadline = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", dateStyle: "long", timeStyle: "short",
});
type InvitationStatus = "open" | "expired" | "accepted" | "closed" | "declined";
type RosterNotice = {
  id: string; kind: string; title: string; body: string;
  expiresAt?: string | null; inviteStatus?: InvitationStatus;
};
type Feed = { publicKey: string | null; testEnabled?: boolean; notices: RosterNotice[] };

function keyBytes(key: string) {
  return Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(key.length / 4) * 4, "=")), byte => byte.charCodeAt(0));
}

export function RosterNotifications({ token, mode, onAccepted }: {
  token: string;
  mode: "invites" | "settings";
  onAccepted?: () => void;
}) {
  const { confirm, confirmation } = useActionConfirmation();
  const [feed, setFeed] = useState<Feed>();
  const [subscribed, setSubscribed] = useState(false);
  const [supported, setSupported] = useState(false);
  const [installOnIos, setInstallOnIos] = useState(false);
  const [notice, setNotice] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const workerPath = withBasePath("/roster-notifications.js");
  useEffect(() => {
    let active = true;
    if (mode === "settings") {
      const canPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      setSupported(canPush);
      const appleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      setInstallOnIos(appleMobile && !window.matchMedia("(display-mode: standalone)").matches &&
        !(navigator as Navigator & { standalone?: boolean }).standalone);
      if (canPush) {
        void navigator.serviceWorker.getRegistration(workerPath).then(registration => registration?.pushManager.getSubscription())
          .then(subscription => subscription && apiPost<{ subscribed: boolean }>(PATH + "/device", token, { endpoint: subscription.endpoint }))
          .then(device => { if (active) setSubscribed(device?.subscribed ?? false); }).catch(() => undefined);
      }
    }
    void apiGet<Feed>(PATH + "/me", token).then(value => { if (active) setFeed(value); })
      .catch(error => { if (active) setNotice(dasError(error)); });
    return () => { active = false; };
  }, [mode, token, workerPath]);

  useEffect(() => {
    if (mode !== "invites") return;
    const syncTarget = () => setTarget(window.location.hash.slice(1));
    syncTarget();
    window.addEventListener("hashchange", syncTarget);
    return () => window.removeEventListener("hashchange", syncTarget);
  }, [mode]);

  useEffect(() => {
    if (feed && target.startsWith("convite-")) document.getElementById(target)?.scrollIntoView({ block: "center" });
  }, [feed, target]);

  async function toggle() {
    if (!feed?.publicKey || busy) return;
    const publicKey = feed.publicKey;
    setBusy(true);
    setNotice("");
    try {
      if (!subscribed && await Notification.requestPermission() !== "granted") {
        setNotice("Permita notificações nas configurações do navegador para ativar os avisos.");
        return;
      }
      await navigator.serviceWorker.register(workerPath);
      const registration = await navigator.serviceWorker.ready;
      let existing = await registration.pushManager.getSubscription();
      const savedKey = existing?.options.applicationServerKey;
      const expected = keyBytes(publicKey);
      if (!subscribed && savedKey && (savedKey.byteLength !== expected.length || new Uint8Array(savedKey).some((value, index) => value !== expected[index]))) {
        await existing?.unsubscribe();
        existing = null;
      }
      if (subscribed && existing) {
        await apiPost(PATH + "/unsubscribe", token, { endpoint: existing.endpoint });
        await existing.unsubscribe();
        setSubscribed(false);
        setNotice("Avisos desativados neste dispositivo.");
      } else {
        const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: expected });
        const { keys } = subscription.toJSON();
        try {
          await apiPost(PATH + "/subscribe", token, { endpoint: subscription.endpoint, p256dh: keys?.p256dh, auth: keys?.auth });
        } catch (error) {
          if (!existing) await subscription.unsubscribe().catch(() => false);
          throw error;
        }
        setSubscribed(true);
        setNotice("Avisos ativados neste dispositivo.");
      }
    } catch (error) {
      setNotice(dasError(error));
    } finally {
      setBusy(false);
    }
  }

  async function testPush() {
    setBusy(true);
    setNotice("");
    try {
      const registration = await navigator.serviceWorker.getRegistration(workerPath);
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) return setNotice("Ative os avisos neste dispositivo primeiro.");
      await apiPost(PATH + "/test", token, { endpoint: subscription.endpoint });
      setNotice("O provedor aceitou o teste. Confira as notificações deste dispositivo.");
    } catch (error) {
      setNotice(dasError(error));
    } finally {
      setBusy(false);
    }
  }

  async function respond(item: RosterNotice, action: "accept" | "decline") {
    const slotInvite = item.kind === "slot-invite";
    const invitationId = item.id.slice(item.id.indexOf(":") + 1);
    const route = slotInvite ? "/slot-invites/" : "/invites/";
    const updateStatus = (inviteStatus: InvitationStatus) => setFeed(current => current && {
      ...current, notices: current.notices.map(notice => notice.id === item.id ? { ...notice, inviteStatus } : notice),
    });
    setBusy(true);
    setNotice("");
    try {
      if (action === "decline" && !(await confirm({
        title: slotInvite ? "Recusar o convite para este culto?" : "Recusar o convite de substituição?",
        subject: item.body,
        description: "A vaga segue disponível para outro voluntário.",
        action: "Recusar convite", cancel: "Voltar", tone: "danger",
      }))) return;
      await apiPost(PATH + route + encodeURIComponent(invitationId) + "/" + action, token);
      updateStatus(action === "accept" ? "accepted" : "declined");
      if (action === "accept") onAccepted?.();
      const accepted = slotInvite ? "Presença confirmada." : "Substituição confirmada.";
      setNotice(action === "accept" ? accepted + " Veja o culto em Minha escala." : "Convite recusado.");
    } catch (error) {
      if (slotInvite && error instanceof ApiRequestError && error.status === 409 && /ROSTER_SLOT_FILLED|vaga já foi preenchida/i.test(error.message)) {
        updateStatus("closed");
        setNotice("Esta vaga já foi preenchida.");
      } else {
        setNotice(dasError(error));
      }
    } finally {
      setBusy(false);
    }
  }

  if (mode === "settings") {
    return <section className={styles.card} aria-label="Notificações no dispositivo">
      <h2>Notificações no dispositivo</h2>
      {!feed && !notice && <p role="status">Carregando preferências…</p>}
      {feed && !feed.publicKey && <p>As notificações no dispositivo estão indisponíveis.</p>}
      {feed?.publicKey && installOnIos && <p>No iPhone ou iPad, abra Compartilhar no Safari e toque em “Adicionar à Tela de Início”. Depois, ative as notificações no app instalado.</p>}
      {feed?.publicKey && !supported && !installOnIos && <p>Este navegador não permite notificações no dispositivo.</p>}
      {feed?.publicKey && supported && !installOnIos && <button className={styles.primary} type="button" disabled={busy} onClick={() => void toggle()}>
        {subscribed ? "Desativar notificações" : "Ativar notificações"}
      </button>}
      {feed?.testEnabled && subscribed && <button className={styles.ghost} type="button" disabled={busy} onClick={() => void testPush()}>Testar notificação</button>}
      {notice && <p role="status">{notice}</p>}
    </section>;
  }

  const invitations = (feed?.notices ?? [])
    .filter(item => item.kind === "substitute" || item.kind === "slot-invite")
    .map(item => ({
      ...item,
      anchor: (item.kind === "slot-invite" ? "convite-vaga-" : "convite-") + item.id.slice(item.id.indexOf(":") + 1),
      status: item.inviteStatus === "open" && item.expiresAt && Date.parse(item.expiresAt) <= Date.now() ? "expired" : item.inviteStatus,
    }))
    .filter(item => item.status === "open" || item.anchor === target);
  if (!invitations.length && !notice) return null;

  return <section className={styles.invites} aria-label="Convites para cultos">
    {confirmation}
    <h2><UIIcon name="mail" size={19} /> Convites para cultos</h2>
    {notice && <p role="status">{notice}</p>}
    {invitations.length > 0 && <ul>{invitations.map(item => {
      const { id, anchor, status, title, body, expiresAt } = item;
      const slotInvite = item.kind === "slot-invite";
      const statusLabel = {
        accepted: slotInvite ? "Presença confirmada" : "Substituição confirmada",
        expired: "Prazo encerrado",
        declined: "Convite recusado",
        closed: "Convite encerrado",
        open: "Aguardando resposta",
      };
      return (<li key={id} id={anchor} className={styles.inviteItem} data-targeted={anchor === target || undefined}>
        <h3>{title}</h3>
        <p>{body}</p>
        {status === "open" && expiresAt && Number.isFinite(Date.parse(expiresAt)) &&
          <p><strong>Responda até <time dateTime={expiresAt}>{inviteDeadline.format(new Date(expiresAt))}</time>.</strong></p>}
        {status === "open" ? <div className={styles.actions}>
          <button className={styles.primary} type="button" disabled={busy} onClick={() => void respond(item, "accept")}>{slotInvite ? "Aceitar convite" : "Aceitar substituição"}</button>
          <button className={styles.agendaDecline} type="button" disabled={busy} onClick={() => void respond(item, "decline")}>{slotInvite ? "Não posso servir" : "Não posso substituir"}</button>
        </div> : <strong>{statusLabel[status ?? "closed"]}</strong>}
      </li>);
    })}</ul>}
  </section>;
}
