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
    let payload = { title: "通知", body: "新着メッセージがあります" };
    try {
      payload = event.data.json();
    } catch (e) {
      payload.body = event.data.text() || payload.body;
    }

    const options = {
      body: payload.body,
      icon: '/icon-192x192.png',
      vibrate: [100, 50, 100],
      data: { dateOfArrival: Date.now() }
    };

    event.waitUntil(
      self.registration.showNotification(payload.title, options)
    );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});
