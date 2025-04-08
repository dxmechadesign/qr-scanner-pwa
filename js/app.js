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
                multiScan: document.getElementById('nav-multi-scan'),
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

        // 複数スキャナー初期化
        this.initMultiScanner()
            .then(() => {
                console.log('複数スキャナーが正常に初期化されました');
                // 複数スキャンボタンが存在することを確認
                const multiScanButton = document.getElementById('nav-multi-scan');
                if (multiScanButton) {
                    console.log('複数スキャンボタンが見つかりました');
                    
                    // ボタンのイベントリスナーを確実に設定
                    multiScanButton.addEventListener('click', () => {
                        console.log('複数スキャンボタンがクリックされました');
                        this.handleNavigation('multiScan');
                    });
                } else {
                    console.error('複数スキャンボタンが見つかりません');
                }
            })
            .catch(error => {
                console.error('複数スキャナーの初期化に失敗:', error);
            });

        // デモ用のローカルストレージ初期化
        this.initLocalStorage();

        // 履歴を表示
        this.displayHistory();
    },

    // 現在アクティブなすべてのメディアストリームを停止
    stopAllMediaTracks() {
        console.log('すべてのメディアトラックを停止します');
        
        if (window.activeMediaStreams) {
            window.activeMediaStreams.forEach(stream => {
                stream.getTracks().forEach(track => {
                    track.stop();
                    console.log('メディアトラック停止:', track.kind);
                });
            });
            window.activeMediaStreams = [];
        }
        
        // QRスキャナーとMultiQRScannerのカメラも停止
        if (typeof QRScanner !== 'undefined') {
            QRScanner.stop();
        }
        
        if (typeof MultiQRScanner !== 'undefined' && MultiQRScanner.stopScanning) {
            MultiQRScanner.stopScanning();
        }
    },

    // 複数スキャナーの初期化
    initMultiScanner() {
        return new Promise(async (resolve, reject) => {
            try {
                console.log('initMultiScanner開始...');
                
                // カメラリソースを事前に解放
                if (window.releaseAllCameras) {
                    await window.releaseAllCameras();
                } else {
                    this.stopAllMediaTracks();
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                
                // MultiQRScannerが定義されていれば初期化
                if (typeof MultiQRScanner !== 'undefined') {
                    console.log('MultiQRScannerが定義されています。init実行前');
                    
                    // MultiQRScanner.initがPromiseを返すか確認
                    const initResult = MultiQRScanner.init();
                    console.log('initResult:', initResult);
                    
                    if (initResult && typeof initResult.then === 'function') {
                        initResult.then(() => {
                            console.log('複数QRコードスキャナーを初期化しました');
                            resolve();
                        })
                        .catch(error => {
                            console.error('複数QRコードスキャナーの初期化に失敗:', error);
                            resolve(); // エラーでもアプリは続行する
                        });
                    } else {
                        console.warn('MultiQRScanner.initがPromiseを返しません');
                        resolve(); // Promiseでなくてもアプリは続行する
                    }
                } else {
                    console.warn('MultiQRScannerが定義されていません');
                    resolve(); // 定義されていなくてもアプリは続行する
                }
            } catch (error) {
                console.error('initMultiScannerでエラーが発生:', error);
                resolve(); // エラーでもアプリは続行する
            }
        });
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
            if (this.elements.navButtons[key]) {
                this.elements.navButtons[key].addEventListener('click', () => {
                    // カメラを完全に停止してから切り替え
                    this.stopAllMediaTracks();
                    setTimeout(() => {
                        this.handleNavigation(key);
                    }, 300);
                });
            }
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

    // ナビゲーション処理
    handleNavigation(target) {
        console.log(`ナビゲーション: ${target}に切り替えます`);
        
        // すべてのカメラを解放
        if (window.releaseAllCameras) {
            window.releaseAllCameras().then(() => {
                this._switchView(target);
            });
        } else {
            // 従来の方法でカメラを停止
            this.stopAllMediaTracks();
            setTimeout(() => {
                this._switchView(target);
            }, 500);
        }
    },

    // 実際のビュー切り替え処理（プライベートメソッド）
    _switchView(view) {
        console.log(`ナビゲーション: ${view}に切り替えます`);
        
        // すべてのビューを非表示
        document.querySelectorAll('.view-container').forEach(container => {
            container.style.display = 'none';
        });
        
        // 選択されたビューを表示
        const targetView = document.getElementById(`${view}-container`);
        if (targetView) {
            targetView.style.display = 'block';
            console.log(`${view}-container要素:`, targetView);
            
            if (view === 'multiScan') {
                console.log('複数スキャンビューを表示しました');
                if (typeof MultiQRScanner !== 'undefined') {
                    console.log('MultiQRScannerが定義されています');
                    if (typeof MultiQRScanner.showMultiScanView === 'function') {
                        MultiQRScanner.showMultiScanView();
                    } else {
                        console.error('showMultiScanViewメソッドが定義されていません');
                    }
                }
            }
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
    // グローバルなカメラストリーム管理
    window.activeMediaStreams = [];

    // アプリケーション全体のカメラリソース解放
    window.releaseAllCameras = function() {
        console.log('すべてのカメラリソースを解放します');
        
        // メディアトラックの停止
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            if (window.activeMediaStreams) {
                window.activeMediaStreams.forEach(stream => {
                    if (stream && stream.getTracks) {
                        stream.getTracks().forEach(track => {
                            track.stop();
                            console.log('メディアトラック停止:', track.kind);
                        });
                    }
                });
                window.activeMediaStreams = [];
            }
        }
        
        // すべてのビデオ要素のソースをクリア
        document.querySelectorAll('video').forEach(video => {
            if (video.srcObject) {
                video.srcObject = null;
                console.log('ビデオソースをクリア:', video.id);
            }
        });
        
        return new Promise(resolve => setTimeout(resolve, 500));
    };
    
    // カメラアクセス許可を事前に取得
    try {
        console.log('カメラ許可を事前に確認します');
        navigator.mediaDevices.getUserMedia({ video: true })
            .then(temporaryStream => {
                // 許可を取得したら即座に停止
                temporaryStream.getTracks().forEach(track => track.stop());
                console.log('カメラ許可を確認しました');
                
                // アプリ初期化
                App.init();
            })
            .catch(error => {
                console.warn('カメラ許可の事前確認に失敗:', error);
                // アプリ初期化（エラーがあっても続行）
                App.init();
            });
    } catch (error) {
        console.warn('カメラ許可の事前確認に失敗:', error);
        // アプリ初期化（エラーがあっても続行）
        App.init();
    }
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