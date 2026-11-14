"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../lib/api";
import { dasError, formatChurchDate } from "../../lib/das-operations";
import { withBasePath } from "../../lib/paths";
import styles from "./serving.module.css";

const PATH = "/rosters/notifications";
type Feed = { publicKey: string | null; testEnabled?: boolean; notices: {
  id: string; kind: string; title: string; body: string; path: string; createdAt: string;
  expiresAt?: string | null; inviteStatus?: "open" | "expired" | "accepted" | "closed";
}[] };

function keyBytes(key: string) {
  return Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(key.length / 4) * 4, "=")), byte => byte.charCodeAt(0));
}

export function RosterNotifications({ token, onAccepted }: { token: string; onAccepted: () => void }) {
  const [feed, setFeed] = useState<Feed>();
  const [subscribed, setSubscribed] = useState(false);
  const [supported, setSupported] = useState(false);
  const [installOnIos, setInstallOnIos] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const workerPath = withBasePath("/roster-notifications.js");
  useEffect(() => {
    let active = true;
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
    void apiGet<Feed>(PATH + "/me", token).then(value => { if (active) setFeed(value); })
      .catch(error => { if (active) setNotice(dasError(error)); });
    return () => { active = false; };
  }, [token, workerPath]);

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

  async function accept(id: string) {
    setBusy(true);
    setNotice("");
    try {
      await apiPost(PATH + "/invites/" + encodeURIComponent(id.split(":")[1]) + "/accept", token);
      setFeed(current => current && { ...current, notices: current.notices.filter(item => item.id !== id) });
      onAccepted();
      setNotice("Substituição confirmada. Veja o culto em Minha escala.");
    } catch (error) {
      setNotice(dasError(error));
    } finally {
      setBusy(false);
    }
  }

  return <section className={styles.card} aria-label="Avisos da escala" id="avisos-da-escala">
    <h2>Avisos da escala</h2>
    {feed?.publicKey && installOnIos && <p>No iPhone ou iPad, abra o menu Compartilhar do Safari, toque em “Adicionar à Tela de Início” e ative os avisos pelo app instalado.</p>}
    {feed?.publicKey && supported && !installOnIos && <button className={styles.primary} type="button" disabled={busy} onClick={() => void toggle()}>
      {subscribed ? "Desativar avisos no dispositivo" : "Ativar avisos no dispositivo"}
    </button>}
    {feed?.testEnabled && subscribed && <button className={styles.primary} type="button" disabled={busy} onClick={() => void testPush()}>Enviar push de teste</button>}
    {notice && <p role="status">{notice}</p>}
    {feed && (feed.notices.length ? <ul>{feed.notices.map(item => <li key={item.id}>
      <a href={withBasePath(item.path)}>{item.title}</a>
      <p>{item.body} · {formatChurchDate(item.createdAt)}</p>
      {item.kind === "substitute" && (() => {
        const status = item.inviteStatus === "open" && item.expiresAt && Date.parse(item.expiresAt) <= Date.now() ? "expired" : item.inviteStatus;
        if (status === "open") return <button className={styles.primary} type="button" disabled={busy} onClick={() => void accept(item.id)}>Aceitar substituição</button>;
        return <strong>{status === "accepted" ? "Substituição confirmada" : status === "expired" ? "Prazo encerrado" : "Convite encerrado"}</strong>;
      })()}
    </li>)}</ul> : <p>Você ainda não tem avisos.</p>)}
  </section>;
}
