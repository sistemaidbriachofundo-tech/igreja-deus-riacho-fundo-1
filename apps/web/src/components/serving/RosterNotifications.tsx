"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../lib/api";
import { dasError, formatChurchDate } from "../../lib/das-operations";
import { withBasePath } from "../../lib/paths";
import styles from "./serving.module.css";

const PATH = "/rosters/notifications";
type Feed = { publicKey: string | null; notices: { id: string; kind: string; title: string; body: string; path: string; createdAt: string }[] };

function keyBytes(key: string) {
  return Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(key.length / 4) * 4, "=")), byte => byte.charCodeAt(0));
}

export function RosterNotifications({ token, onAccepted }: { token: string; onAccepted: () => void }) {
  const [feed, setFeed] = useState<Feed>();
  const [subscribed, setSubscribed] = useState(false);
  const [supported, setSupported] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const workerPath = withBasePath("/roster-notifications.js");
  useEffect(() => {
    let active = true;
    const canPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(canPush);
    if (canPush) {
      void navigator.serviceWorker.getRegistration(workerPath).then(registration => registration?.pushManager.getSubscription())
        .then(subscription => { if (active) setSubscribed(Boolean(subscription)); }).catch(() => undefined);
    }
    void apiGet<Feed>(PATH + "/me", token).then(value => { if (active) setFeed(value); })
      .catch(error => { if (active) setNotice(dasError(error)); });
    return () => { active = false; };
  }, [token, workerPath]);

  async function toggle() {
    if (!feed?.publicKey || busy) return;
    setBusy(true);
    setNotice("");
    try {
      if (!subscribed && await Notification.requestPermission() !== "granted") {
        setNotice("Permita notificações nas configurações do navegador para ativar os avisos.");
        return;
      }
      await navigator.serviceWorker.register(workerPath);
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (subscribed && existing) {
        await apiPost(PATH + "/unsubscribe", token, { endpoint: existing.endpoint });
        await existing.unsubscribe();
        setSubscribed(false);
        setNotice("Avisos desativados neste dispositivo.");
      } else {
        const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(feed.publicKey) });
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
    {feed?.publicKey && supported && <button className={styles.primary} type="button" disabled={busy} onClick={() => void toggle()}>
      {subscribed ? "Desativar avisos no dispositivo" : "Ativar avisos no dispositivo"}
    </button>}
    {notice && <p role="status">{notice}</p>}
    {feed && (feed.notices.length ? <ul>{feed.notices.map(item => <li key={item.id}>
      <a href={withBasePath(item.path)}>{item.title}</a>
      <p>{item.body} · {formatChurchDate(item.createdAt)}</p>
      {item.kind === "substitute" && <button className={styles.primary} type="button" disabled={busy} onClick={() => void accept(item.id)}>Aceitar substituição</button>}
    </li>)}</ul> : <p>Você ainda não tem avisos.</p>)}
  </section>;
}
