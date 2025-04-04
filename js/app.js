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
            scanStatus: document.getElementById('scan-status'),
            duplicateNotification: document.getElementById('duplicate-notification'),
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

        // 複数スキャナーの初期化
        this.initMultiScanner();
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

    // 重複通知の表示
    showDuplicateNotification(data) {
        // 通知領域が存在する場合
        if (this.elements.duplicateNotification) {
            // データを表示
            this.elements.duplicateNotification.innerHTML = `
                <div class="duplicate-content">
                    <span class="duplicate-icon">⚠️</span>
                    <span class="duplicate-text">重複: ${data}</span>
                </div>
            `;
            
            // 表示
            this.elements.duplicateNotification.classList.remove('hidden');
            this.elements.duplicateNotification.classList.add('show');
            
            // 3秒後に非表示
            setTimeout(() => {
                this.elements.duplicateNotification.classList.remove('show');
                setTimeout(() => {
                    this.elements.duplicateNotification.classList.add('hidden');
                }, 300);
            }, 3000);
        } else {
            // DOM要素がない場合はトーストで表示
            this.showToast(`重複: ${data}`);
        }
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
        
        // 自動スクロールで最新の項目を表示
        batchItems.scrollTop = batchItems.scrollHeight;
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

    // ナビゲーション処理を拡張 (handleNavigation メソッド内)
    // 例: 
    handleNavigation(target) {
        // アクティブなナビゲーションボタンの更新
        Object.keys(this.elements.navButtons).forEach(key => {
            this.elements.navButtons[key].classList.remove('active');
        });
        
        if (this.elements.navButtons[target]) {
            this.elements.navButtons[target].classList.add('active');
        }
        
        // すべてのビューを非表示
        document.querySelectorAll('.view-container').forEach(container => {
            container.style.display = 'none';
        });
        
        // 対象のビューを表示
        switch (target) {
            case 'scan':
                // 通常のスキャンビュー
                document.getElementById('scanner-container').style.display = 'block';
                // 他のモードを停止
                if (typeof MultiQRScanner !== 'undefined') {
                    MultiQRScanner.stopCamera();
                }
                break;
                
            case 'multiScan':
                // 複数スキャンビュー
                document.getElementById('scanner-container').style.display = 'none';
                document.getElementById('multi-qr-container').style.display = 'block';
                
                // スキャナーを停止
                QRScanner.stop();
                
                // キャプチャUIを表示
                if (typeof MultiQRScanner !== 'undefined') {
                    MultiQRScanner.showCaptureUI();
                }
                break;
                
            case 'history':
                // 履歴ビュー
                document.getElementById('history-container').style.display = 'block';
                // スキャナーを停止
                QRScanner.stop();
                if (typeof MultiQRScanner !== 'undefined') {
                    MultiQRScanner.stopCamera();
                }
                break;
                
            case 'settings':
                // 設定ビュー
                document.getElementById('settings-container').style.display = 'block';
                // スキャナーを停止
                QRScanner.stop();
                if (typeof MultiQRScanner !== 'undefined') {
                    MultiQRScanner.stopCamera();
                }
                break;
                
            default:
                // デフォルトはスキャンビュー
                document.getElementById('scanner-container').style.display = 'block';
                break;
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
    },

    initMultiScanner() {
        // ナビゲーションボタンの参照を追加
        this.elements.navButtons.multiScan = document.getElementById('nav-multi-scan');
        
        // MultiQRScannerの初期化
        if (typeof MultiQRScanner !== 'undefined') {
            MultiQRScanner.init().catch(error => {
                console.error('複数QRコードスキャナーの初期化に失敗:', error);
            });
        }
        
        // 複数スキャンモードの切り替えボタン
        if (this.elements.navButtons.multiScan) {
            this.elements.navButtons.multiScan.addEventListener('click', () => {
                this.handleNavigation('multiScan');
            });
        }
        
        // 画像読み込みボタン (オプション)
        const imageUploadButton = document.getElementById('image-upload-button');
        if (imageUploadButton) {
            imageUploadButton.addEventListener('click', this.handleImageUpload.bind(this));
        }
    },

    // 画像ファイルの読み込み処理 (オプション)
    handleImageUpload() {
        // ファイル選択ダイアログの作成
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        
        fileInput.addEventListener('change', (event) => {
            if (event.target.files && event.target.files[0]) {
                const file = event.target.files[0];
                
                // 画像ファイルをURLに変換
                const imageUrl = URL.createObjectURL(file);
                
                // MultiQRScannerとの連携処理
                if (typeof MultiQRScanner !== 'undefined') {
                    // 撮影画像を設定
                    document.getElementById('captured-image').src = imageUrl;
                    
                    // 結果UIの表示
                    document.getElementById('capture-ui').classList.remove('active');
                    document.getElementById('results-ui').classList.add('active');
                    
                    // 画像からのQRコード検出処理
                    MultiQRScanner.capturedImage = imageUrl;
                    MultiQRScanner.detectQRCodes();
                }
            }
        });
        
        // ファイル選択ダイアログを表示
        fileInput.click();
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