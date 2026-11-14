self.addEventListener("push", event => {
  if (!event.data) return;
  let notice;
  try {
    notice = event.data.json();
  } catch {
    return;
  }
  if (!notice?.title || !notice.id) return;
  event.waitUntil(self.registration.showNotification(notice.title, {
    body: notice.body,
    tag: notice.id,
    icon: new URL("images/portal-voluntario-192.png", self.registration.scope).href,
    data: { path: notice.path },
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const path = event.notification.data?.path;
  const portal = "/app/servir/meu-espaco/";
  const relative = typeof path === "string" && (path === portal || path.startsWith(portal + "#")) ? path : portal;
  const url = new URL(relative.slice(1), self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const target = windows.find(client => client.url.split("#")[0] === url.split("#")[0]);
    if (target) {
      if (target.url !== url) await target.navigate(url);
      return target.focus();
    }
    return self.clients.openWindow(url);
  })());
});
