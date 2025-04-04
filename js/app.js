// アプリケーションのメイン処理
const App = {
    // 初期化
    init() {
        // DOM要素の参照を保持
        this.elements = {
            scannerContainer: document.querySelector('.scanner-container'),
            resultContainer: document.getElementById('scan-result'),
            resultText: document.getElementById('result-text'),
            startButton: document.getElementById('start-button'),
            stopButton: document.getElementById('stop-button'),
            batchScanButton: document.getElementById('batch-scan-button'),
            copyButton: document.getElementById('copy-button'),
            saveButton: document.getElementById('save-button'),
            scanAgainButton: document.getElementById('scan-again-button'),
            cameraSelect: document.getElementById('camera-select'),
            connectionStatus: document.getElementById('connection-status'),
            historyList: document.getElementById('history-list'),
            batchContainer: document.getElementById('batch-scan-container'),
            batchItems: document.getElementById('batch-items'),
            batchCount: document.getElementById('batch-count'),
            batchComplete: document.getElementById('batch-complete'),
            batchCancel: document.getElementById('batch-cancel'),
            navButtons: {
                scan: document.getElementById('nav-scan'),
                history: document.getElementById('nav-history'),
                settings: document.getElementById('nav-settings')
            }
        };

        // イベントリスナーを設定
        this.setupEventListeners();

        // オフライン/オンライン状態の監視
        this.monitorNetworkStatus();

        // スキャナー初期化
        QRScanner.init();

        // デモ用のローカルストレージ初期化
        this.initLocalStorage();

        // 履歴を表示
        this.displayHistory();
    },

    // イベントリスナー設定
    setupEventListeners() {
        // QRスキャン開始
        this.elements.startButton.addEventListener('click', () => {
            QRScanner.start()
                .then(() => {
                    this.elements.startButton.disabled = true;
                    this.elements.stopButton.disabled = false;
                    this.elements.batchScanButton.disabled = false;
                    this.elements.resultContainer.classList.add('hidden');
                })
                .catch(err => {
                    alert('カメラへのアクセスに失敗しました: ' + err.message);
                    console.error('カメラアクセスエラー:', err);
                });
        });

        // QRスキャン停止
        this.elements.stopButton.addEventListener('click', () => {
            QRScanner.stop();
            this.elements.startButton.disabled = false;
            this.elements.stopButton.disabled = true;
        });

        // 一括スキャン開始
        this.elements.batchScanButton.addEventListener('click', () => {
            // 結果表示がある場合は非表示に
            this.elements.resultContainer.classList.add('hidden');
            
            // 一括スキャンモードを有効化
            QRScanner.toggleBatchMode(true);
            
            // スキャン停止中なら開始
            if (!QRScanner.isScanning) {
                QRScanner.start()
                    .then(() => {
                        this.elements.startButton.disabled = true;
                        this.elements.stopButton.disabled = false;
                        this.elements.batchScanButton.disabled = true;
                    })
                    .catch(err => {
                        alert('カメラへのアクセスに失敗しました: ' + err.message);
                        console.error('カメラアクセスエラー:', err);
                    });
            } else {
                // すでにスキャン中なら一括モードにして継続
                this.elements.batchScanButton.disabled = true;
            }
        });

        // 一括スキャン完了
        this.elements.batchComplete.addEventListener('click', () => {
            const results = QRScanner.batchResults;
            if (results.length > 0) {
                // 全ての結果を保存
                results.forEach(scan => {
                    this.saveScannedData(scan.data);
                });
                
                this.showToast(`${results.length}件のQRコードを保存しました`);
                
                // バッチモード終了
                QRScanner.stop();
                QRScanner.toggleBatchMode(false);
                this.elements.startButton.disabled = false;
                this.elements.stopButton.disabled = true;
                this.elements.batchScanButton.disabled = false;
                
                // 履歴を更新
                this.displayHistory();
            } else {
                this.showToast('スキャン結果がありません');
            }
        });

        // 一括スキャンキャンセル
        this.elements.batchCancel.addEventListener('click', () => {
            QRScanner.stop();
            QRScanner.toggleBatchMode(false);
            this.elements.startButton.disabled = false;
            this.elements.stopButton.disabled = true;
            this.elements.batchScanButton.disabled = false;
            this.showToast('一括スキャンをキャンセルしました');
        });

        // 結果をクリップボードにコピー
        this.elements.copyButton.addEventListener('click', () => {
            const text = this.elements.resultText.textContent;
            navigator.clipboard.writeText(text)
                .then(() => {
                    this.showToast('コピーしました');
                })
                .catch(err => {
                    console.error('クリップボードエラー:', err);
                    this.showToast('コピーに失敗しました');
                });
        });

        // 結果を保存
        this.elements.saveButton.addEventListener('click', () => {
            const data = this.elements.resultText.textContent;
            this.saveScannedData(data);
            this.showToast('保存しました');
            this.displayHistory();
        });

        // 再スキャン
        this.elements.scanAgainButton.addEventListener('click', () => {
            this.elements.resultContainer.classList.add('hidden');
            QRScanner.start()
                .then(() => {
                    this.elements.startButton.disabled = true;
                    this.elements.stopButton.disabled = false;
                });
        });

        // ナビゲーション
        Object.keys(this.elements.navButtons).forEach(key => {
            this.elements.navButtons[key].addEventListener('click', () => {
                this.handleNavigation(key);
            });
        });
    },

    // スキャン結果の表示
    showScanResult(data) {
        // スキャナーを停止
        QRScanner.stop();
        
        // ボタン状態の更新
        this.elements.startButton.disabled = false;
        this.elements.stopButton.disabled = true;
        this.elements.batchScanButton.disabled = false;
        
        // 結果の表示
        this.elements.resultText.textContent = data;
        this.elements.resultContainer.classList.remove('hidden');
    },

    // 一括スキャンUI更新メソッド
    updateBatchUI(batchResults) {
        const batchItems = this.elements.batchItems;
        const batchCount = this.elements.batchCount;
        
        // カウント更新
        batchCount.textContent = `${batchResults.length}件`;
        
        // リスト更新
        batchItems.innerHTML = '';
        batchResults.forEach(item => {
            const batchItem = document.createElement('div');
            batchItem.className = 'batch-item';
            batchItem.innerHTML = `
                <div class="batch-item-data">${item.data}</div>
                <button class="batch-item-remove" data-id="${item.id}">✕</button>
            `;
            batchItems.appendChild(batchItem);
        });
        
        // 削除ボタンのイベント設定
        const removeButtons = document.querySelectorAll('.batch-item-remove');
        removeButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');
                QRScanner.batchResults = QRScanner.batchResults.filter(item => item.id !== id);
                this.updateBatchUI(QRScanner.batchResults);
            });
        });
    },

    // スキャンデータの保存
    saveScannedData(data) {
        const timestamp = new Date().toISOString();
        const newScan = {
            id: Date.now().toString(),
            data: data,
            timestamp: timestamp,
            syncStatus: 'pending'
        };
        
        // ローカルストレージに保存
        const history = JSON.parse(localStorage.getItem('scanHistory') || '[]');
        history.unshift(newScan); // 新しいスキャンを先頭に追加
        
        // 最大100件までに制限
        if (history.length > 100) {
            history.pop();
        }
        
        localStorage.setItem('scanHistory', JSON.stringify(history));
        
        // オンライン時は即時送信を試みる
        if (navigator.onLine) {
            this.syncToSpreadsheet(newScan);
        }
    },

    // スプレッドシートへの同期（フェーズ2で実装）
    syncToSpreadsheet(scanData) {
        // フェーズ2でGoogle Sheets APIとの連携を実装
        console.log('スプレッドシートへ同期する予定のデータ:', scanData);
        
        // 仮の成功コールバック（実際の実装では非同期処理）
        setTimeout(() => {
            // 同期成功を記録
            const history = JSON.parse(localStorage.getItem('scanHistory') || '[]');
            const updatedHistory = history.map(item => {
                if (item.id === scanData.id) {
                    return { ...item, syncStatus: 'synced' };
                }
                return item;
            });
            localStorage.setItem('scanHistory', JSON.stringify(updatedHistory));
            
            // 履歴表示を更新
            this.displayHistory();
        }, 1000);
    },

    // 履歴の表示
    displayHistory() {
        const history = JSON.parse(localStorage.getItem('scanHistory') || '[]');
        const historyList = this.elements.historyList;
        
        // 履歴リストをクリア
        historyList.innerHTML = '';
        
        if (history.length === 0) {
            historyList.innerHTML = '<p class="empty-message">履歴がありません</p>';
            return;
        }
        
        // 履歴アイテムの作成
        history.forEach(item => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            
            const date = new Date(item.timestamp);
            const formattedDate = `${date.getFullYear()}/${(date.getMonth()+1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
            
            historyItem.innerHTML = `
                <div class="history-data">${item.data}</div>
                <div class="history-time">${formattedDate}</div>
            `;
            
            // 同期状態を視覚的に表示（オプション）
            if (item.syncStatus === 'pending') {
                historyItem.classList.add('pending');
            }
            
            historyList.appendChild(historyItem);
        });
    },

    // ネットワーク状態の監視
    monitorNetworkStatus() {
        const updateNetworkStatus = () => {
            if (navigator.onLine) {
                this.elements.connectionStatus.textContent = 'オンライン';
                this.elements.connectionStatus.className = 'online';
                // オンラインになったら保留中のデータ同期を試みる
                this.syncPendingData();
            } else {
                this.elements.connectionStatus.textContent = 'オフライン';
                this.elements.connectionStatus.className = 'offline';
            }
        };
        
        // 初期状態を設定
        updateNetworkStatus();
        
        // オンライン/オフラインイベントのリスナー
        window.addEventListener('online', updateNetworkStatus);
        window.addEventListener('offline', updateNetworkStatus);
    },

    // 保留中データの同期
    syncPendingData() {
        const history = JSON.parse(localStorage.getItem('scanHistory') || '[]');
        const pendingItems = history.filter(item => item.syncStatus === 'pending');
        
        if (pendingItems.length > 0) {
            console.log(`${pendingItems.length}件の保留中データを同期します`);
            // 各保留アイテムを同期（実際の実装では非同期処理をループ）
            pendingItems.forEach(item => {
                this.syncToSpreadsheet(item);
            });
        }
    },

    // ナビゲーション処理
    handleNavigation(target) {
        // アクティブなナビゲーションボタンの更新
        Object.keys(this.elements.navButtons).forEach(key => {
            this.elements.navButtons[key].classList.remove('active');
        });
        this.elements.navButtons[target].classList.add('active');
        
        // 現段階では単一ページのみ（フェーズ1）
        // フェーズ4でマルチビュー対応予定
        if (target === 'scan') {
            // カメラビューを表示
            this.elements.scannerContainer.style.display = 'block';
        } else {
            // 将来の実装のためのプレースホルダー
            alert('この機能は開発中です');
            // デフォルトビューに戻す
            this.elements.navButtons.scan.classList.add('active');
        }
    },

    // トースト通知の表示
    showToast(message) {
        // 既存のトーストを削除
        const existingToast = document.querySelector('.toast');
        if (existingToast) {
            existingToast.remove();
        }
        
        // 新しいトーストを作成
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        
        // アニメーションのためにクラスを追加
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        // 3秒後に削除
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3000);
    },

    // デモ用のローカルストレージ初期化
    initLocalStorage() {
        if (!localStorage.getItem('scanHistory')) {
            localStorage.setItem('scanHistory', JSON.stringify([]));
        }
    }
};

// DOMコンテンツ読み込み完了時に初期化
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// トースト用のスタイルを動的に追加
const style = document.createElement('style');
style.textContent = `
    .toast {
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%) translateY(100px);
        background-color: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 0.75rem 1.5rem;
        border-radius: 4px;
        z-index: 1000;
        transition: transform 0.3s ease;
    }
    
    .toast.show {
        transform: translateX(-50%) translateY(0);
    }
`;
document.head.appendChild(style);