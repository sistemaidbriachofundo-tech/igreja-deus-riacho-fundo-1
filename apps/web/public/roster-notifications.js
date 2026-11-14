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
    data: { path: notice.path },
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const path = event.notification.data?.path;
  const portal = "/app/servir/meu-espaco/";
  const relative = typeof path === "string" && (path === portal || path.startsWith(portal + "#")) ? path : portal;
  const url = new URL(relative.slice(1), self.registration.scope).href;
  event.waitUntil(self.clients.openWindow(url));
});
