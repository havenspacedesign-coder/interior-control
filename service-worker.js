const CACHE_NAME = 'interior-control-shell-v3';
const APP_SHELL = [
  './',
  './index.html',
  './app/loader.js',
  './app/module-manifest.js',
  './app/shared/shell.js',
  './app/shared/firebase-config.js',
  './app/shared/core.js',
  './app/shared/auth-shell.js',
  './app/shared/render-router.js',
  './app/shared/projects.js',
  './app/shared/styles/base.css',
  './app/shared/styles/common.css',
  './app/shared/styles/modals-projects.css',
  './app/shared/styles/responsive.css',
  './app/shared/styles/appearance.css',
  './app/features/home/index.js',
  './app/features/home/growth-list.js',
  './app/features/home/recommendations.js',
  './app/features/home/message-board.js',
  './app/features/home/announcements.js',
  './app/features/home/company-duty.js',
  './app/features/home/daily-joke.js',
  './app/features/home/daily-quiz.js',
  './app/features/home/quiz-bank.js',
  './app/features/home/daily-nonsense.js',
  './app/features/home/haven-news.js',
  './app/features/home/home.css',
  './app/features/home/home-widgets.css',
  './app/features/home/haven-news.css',
  './app/features/project-overview/index.js',
  './app/features/design-progress/index.js',
  './app/features/design-progress/design-progress.css',
  './app/features/construction-progress/index.js',
  './app/features/construction-progress/daily-logs.js',
  './app/features/construction-progress/meeting-logs.js',
  './app/features/construction-progress/todos.js',
  './app/features/construction-progress/private-notes.js',
  './app/features/construction-progress/schedule-grid.js',
  './app/features/construction-progress/construction-progress.css',
  './app/features/construction-guide/index.js',
  './app/features/construction-guide/construction-guide.css',
  './app/features/vendors/index.js',
  './app/features/vendors/vendors.css',
  './app/features/vendors/material-guide.css',
  './app/features/members/index.js',
  './app/features/members/members.css',
  './app/features/b1f/index.js',
  './app/features/b1f/local-workflows.js',
  './app/features/b1f/shared-store.js',
  './app/features/b1f/product-management.js',
  './app/features/b1f/b1f-overrides.css',
  './app/features/b1f/b1f-mobile.css',
  './assets/material-guide-seed.json',
  './assets/daily-jokes.json',
  './assets/waste-quotes-seed.json',
  './news.json',
  './manifest.json',
  './favicon.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.filter(function (name) {
        return name !== CACHE_NAME;
      }).map(function (name) {
        return caches.delete(name);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(function () {
        return caches.match('./index.html');
      })
    );
    return;
  }

  const isAppShellAsset = APP_SHELL.some(function (asset) {
    return new URL(asset, self.registration.scope).pathname === url.pathname;
  });

  if (isAppShellAsset) {
    event.respondWith(
      fetch(request).then(function (response) {
        if (response.ok) {
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(request, response.clone());
          });
        }
        return response;
      }).catch(function () {
        return caches.match(request, { ignoreSearch: true });
      })
    );
  }
});
