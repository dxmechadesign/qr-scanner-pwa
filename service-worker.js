// キャッシュ名とバージョン
const CACHE_NAME = 'qr-scanner-cache-v1';

// service-worker.js 内のCACHE_ASSETSの変更
const CACHE_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './css/multi-qr.css',
  './js/app.js',
  './js/qr-scanner.js',
  './js/multi-qr-scanner.js',
  './js/jsQR.js',
  'https://unpkg.com/@zxing/library@0.19.1/umd/index.min.js',
  './manifest.json',
  './images/icons/favicon.png',
  // これらのファイルが実際に存在するか確認
  './images/icons/icon-72x72.png',
  './images/icons/icon-96x96.png',
  './images/icons/icon-128x128.png',
  // './images/icons/icon-144x144.png', // エラーが出ているファイルはコメントアウト
  './images/icons/icon-152x152.png',
  './images/icons/icon-192x192.png',
  './images/icons/icon-384x384.png',
  './images/icons/icon-512x512.png'
];

// Service Workerのインストール
self.addEventListener('install', event => {
  console.log('Service Worker: インストール中');
  
  // キャッシュの作成とアセットの追加
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: キャッシュを開いてアセットを追加');
        return cache.addAll(CACHE_ASSETS);
      })
      .then(() => self.skipWaiting()) // 新しいService Workerをすぐにアクティブにする
  );
});

// Service Workerのアクティベート (古いキャッシュの削除)
self.addEventListener('activate', event => {
  console.log('Service Worker: アクティベート');
  
  // 古いバージョンのキャッシュを削除
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: 古いキャッシュを削除', cache);
            return caches.delete(cache);
          }
        })
      );
    })
    .then(() => self.clients.claim()) // このSWが制御していないクライアントを制御する
  );
});

// fetch イベントの処理 (ネットワークリクエストの制御)
self.addEventListener('fetch', event => {
  console.log('Service Worker: Fetch', event.request.url);
  
  // 外部CDNリソース(ZXingライブラリ)への対応を追加
  const isExternal = event.request.url.startsWith('https://unpkg.com/');
  

  // キャッシュファーストの戦略
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // キャッシュに存在する場合はキャッシュから返す
        if (response) {
          console.log('Service Worker: キャッシュから提供', event.request.url);
          return response;
        }
        
        // キャッシュにない場合はネットワークから取得
        console.log('Service Worker: キャッシュにないため、ネットワークからフェッチ', event.request.url);
        return fetch(event.request)
          .then(networkResponse => {
            // レスポンスが有効な場合のみキャッシュに追加
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }
            
            // レスポンスのクローンを作成（ストリームは一度しか使用できないため）
            const responseToCache = networkResponse.clone();
            
            // ネットワークレスポンスをキャッシュに追加
            caches.open(CACHE_NAME)
              .then(cache => {
                console.log('Service Worker: 新しいリソースをキャッシュに追加', event.request.url);
                cache.put(event.request, responseToCache);
              });
              
            return networkResponse;
          });
      })
      .catch(error => {
        console.log('Service Worker: Fetchに失敗', error);
        // オフラインフォールバックページの表示（オプション）
        // return caches.match('./offline.html');
      })
  );
});

// プッシュ通知の受信（フェーズ4で実装予定）
self.addEventListener('push', event => {
  console.log('Service Worker: プッシュ通知を受信');
  
  // 通知データの取得
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'QRスキャナー';
  const options = {
    body: data.body || '通知があります',
    icon: './images/icons/icon-192x192.png',
    badge: './images/icons/badge-96x96.png'
  };
  
  // 通知の表示
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// 通知のクリックイベント処理
self.addEventListener('notificationclick', event => {
  console.log('Service Worker: 通知がクリックされました');
  
  event.notification.close();
  
  // 通知クリック時のアクション
  event.waitUntil(
    clients.openWindow('/')
  );
});

// バックグラウンド同期（フェーズ3で実装予定）
self.addEventListener('sync', event => {
  console.log('Service Worker: バックグラウンド同期', event.tag);
  
  if (event.tag === 'sync-qr-data') {
    event.waitUntil(syncQRData());
  }
});

// 保留中のQRデータを同期する関数（フェーズ3で実装）
function syncQRData() {
  // IndexedDBから保留中のデータを取得して同期する処理
  console.log('QRデータの同期処理が開始予定です');
  return Promise.resolve();
}