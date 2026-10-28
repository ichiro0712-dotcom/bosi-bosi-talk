self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  // PWAインストール要件を満たすためのダミーfetchハンドラ
});

self.addEventListener('push', function(event) {
  event.waitUntil((async function() {
    let payload = { title: "通知", body: "新着メッセージがあります" };
    try {
      payload = event.data.json();
    } catch (e) {
      payload.body = event.data.text() || payload.body;
    }

    // 既存の通知の件数を引き継いで「○件の新着メッセージ」にまとめる
    // (同じ tag の通知は常に1つに置き換わるので、 length ではなく data.count を足していく)
    const currentNotifications = await self.registration.getNotifications({ tag: 'chat-message' });
    const prevCount = currentNotifications.reduce(function(n, x) { return Math.max(n, (x.data && x.data.count) || 1); }, 0);
    const count = prevCount + 1;

    const options = {
      body: count > 1
        ? count + '件の新着メッセージがあります'
        : payload.body,
      icon: payload.icon || '/icon-192x192.png',
      badge: '/icon-192x192.png',
      vibrate: [200, 100, 200, 100, 200],
      tag: 'chat-message',
      renotify: true,
      silent: false,
      requireInteraction: true,
      data: { dateOfArrival: Date.now(), count: count, url: payload.url || '/' }
    };

    if (count === 1 && payload.image) {
      options.image = payload.image;
    }

    // 古い通知を閉じてから新しいまとめ通知を表示
    currentNotifications.forEach(function(n) { n.close(); });

    await self.registration.showNotification(payload.title, options);

    // 受信記録 (届いていない原因の切り分け用)。 失敗しても通知には影響させない
    try {
      const sub = await self.registration.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push-ack', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      }
    } catch (e) {}
  })());
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
