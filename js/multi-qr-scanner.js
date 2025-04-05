// 複数QRコード検出スキャナー (ZXing実装) - 重複追加なし版 (v1.0.2)
const MultiQRScanner = {
    // 状態管理
    isScanning: false,
    videoElement: null,
    canvasElement: null,
    canvasContext: null,
    videoStream: null,
    scanInterval: null,
    detectedCodes: [],    // 検出済みQRコード
    lastDetection: 0,     // 最後の検出時刻
    
    // 初期化
    init() {
        return new Promise((resolve, reject) => {
            console.log('MultiQRScanner: 初期化開始');
            
            // コンテナの存在を確認
            const container = document.getElementById('multi-qr-container');
            if (!container) {
                console.error('multi-qr-containerが見つかりません');
                reject(new Error('multi-qr-containerが見つかりません'));
                return;
            }
            
            // ビデオ要素の存在を確認
            this.videoElement = document.getElementById('multi-qr-video');
            if (!this.videoElement) {
                console.error('multi-qr-video要素が見つかりません');
                reject(new Error('multi-qr-video要素が見つかりません'));
                return;
            }
            
            // キャンバス要素の作成
            this.canvasElement = document.createElement('canvas');
            this.canvasContext = this.canvasElement.getContext('2d', { willReadFrequently: true });
            
            // 結果リストの確認
            this.resultsList = document.getElementById('detected-codes-list');
            if (!this.resultsList) {
                console.error('detected-codes-list要素が見つかりません');
            }
            
            // ステータス要素の確認
            this.statusElement = document.getElementById('detection-status');
            if (!this.statusElement) {
                console.error('detection-status要素が見つかりません');
            }
            
            // ZXingの利用可能性をチェック
            if (typeof window.ZXing === 'undefined') {
                console.error('ZXingライブラリが利用できません');
                reject(new Error('ZXingライブラリが利用できません'));
                return;
            }
            
            try {
                console.log('ZXingリーダーを初期化中...');
                
                // ZXingライブラリのバージョン確認
                const ZXing = window.ZXing;
                console.log('ZXingライブラリのバージョン:', ZXing);
                
                // APIの形式を確認
                if (!ZXing) {
                    throw new Error('ZXingライブラリが利用できません');
                }
                
                // リーダーの初期化（バージョンによって異なる）
                if (ZXing.BrowserMultiFormatReader) {
                    console.log('BrowserMultiFormatReaderを使用');
                    const hints = {};
                    
                    // 最新バージョンのヒント設定方法
                    if (ZXing.DecodeHintType) {
                        // 古いバージョン
                        const hintsMap = new Map();
                        if (ZXing.BarcodeFormat) {
                            hintsMap.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.QR_CODE]);
                        }
                        if (ZXing.DecodeHintType.TRY_HARDER) {
                            hintsMap.set(ZXing.DecodeHintType.TRY_HARDER, true);
                        }
                        this.reader = new ZXing.BrowserMultiFormatReader(hintsMap);
                    } else {
                        // 新しいバージョン
                        hints.formats = ['QR_CODE'];
                        hints.tryHarder = true;
                        this.reader = new ZXing.BrowserMultiFormatReader(hints);
                    }
                } else if (ZXing.MultiFormatReader) {
                    console.log('MultiFormatReaderを使用');
                    this.reader = new ZXing.MultiFormatReader();
                    
                    // ヒント設定
                    const hints = new Map();
                    if (ZXing.DecodeHintType && ZXing.BarcodeFormat) {
                        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.QR_CODE]);
                        hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
                        this.reader.setHints(hints);
                    }
                } else if (ZXing.Html5Qrcode) {
                    // Html5Qrcode APIの場合
                    console.log('Html5Qrcodeを使用');
                    this.reader = new ZXing.Html5Qrcode('multi-qr-video-container');
                } else {
                    throw new Error('互換性のあるQRコードリーダーが見つかりません');
                }
                
                console.log('作成されたリーダー:', this.reader);
                console.log('利用可能なメソッド:', Object.getOwnPropertyNames(this.reader.__proto__));
                
                // イベントリスナーの設定
                this.setupEventListeners();
                
                console.log('MultiQRScanner: 初期化完了');
                resolve();
            } catch (error) {
                console.error('ZXingリーダーの初期化エラー:', error);
                if (typeof App !== 'undefined' && App.showToast) {
                    App.showToast('QRコード検出機能の初期化に失敗しました');
                }
                reject(error);
            }
        });
    },
    
    // イベントリスナーのセットアップを確認
    setupEventListeners() {
        console.log('イベントリスナーをセットアップ中...');
        
        // 開始/停止ボタンの参照を確認
        const startScanBtn = document.getElementById('start-multi-scan');
        const stopScanBtn = document.getElementById('stop-multi-scan');
        const saveResultsBtn = document.getElementById('save-multi-results');
        const clearResultsBtn = document.getElementById('clear-multi-results');
        
        console.log('ボタン要素:', {
            startScan: startScanBtn,
            stopScan: stopScanBtn,
            saveResults: saveResultsBtn,
            clearResults: clearResultsBtn
        });
        
        if (startScanBtn) {
            startScanBtn.addEventListener('click', () => {
                console.log('スキャン開始ボタンがクリックされました');
                this.startScanning();
            });
        } else {
            console.error('start-multi-scan ボタンが見つかりません');
        }
        
        if (stopScanBtn) {
            stopScanBtn.addEventListener('click', () => {
                console.log('スキャン停止ボタンがクリックされました');
                this.stopScanning();
            });
        }
        
        if (saveResultsBtn) {
            saveResultsBtn.addEventListener('click', () => {
                console.log('保存ボタンがクリックされました');
                this.saveDetectedCodes();
            });
        }
        
        if (clearResultsBtn) {
            clearResultsBtn.addEventListener('click', () => {
                console.log('クリアボタンがクリックされました');
                this.clearResults();
            });
        }
    },
    
    // スキャン開始
    async startScanning() {
        if (this.isScanning) return;
        
        try {
            console.log('複数QRスキャン開始...');
            
            // スキャン準備中表示
            this.updateStatus('カメラ準備中...', 'processing');
            
            // カメラの起動
            await this.startCamera();
            
            // スキャン開始
            this.isScanning = true;
            
            // ボタン状態の更新
            this.updateButtonState(true);
            
            // スキャン処理の開始
            console.log('スキャンインターバル設定...');
            this.scanInterval = setInterval(() => this.scanVideoFrame(), 300);
            
            // スキャン中表示
            this.updateStatus('スキャン中...', 'scanning');
            
        } catch (error) {
            console.error('スキャン開始エラー:', error);
            this.updateStatus('カメラ起動エラー', 'error');
            this.isScanning = false;
        }
    },
    
    // スキャン停止
    stopScanning() {
        if (!this.isScanning) return;
        
        // インターバル停止
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }
        
        // カメラ停止
        this.stopCamera();
        
        // 状態更新
        this.isScanning = false;
        this.updateStatus('スキャン停止', 'stopped');
        this.updateButtonState(false);
    },
    
    // 結果のクリア
    clearResults() {
        this.detectedCodes = [];
        this.updateResultsUI();
        this.updateStatus(this.isScanning ? 'スキャン中...' : '待機中...', 
            this.isScanning ? 'scanning' : 'stopped');
    },
    
    // カメラ起動
    async startCamera() {
        console.log('カメラ起動開始...');
        try {
            const constraints = { 
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                } 
            };
            
            console.log('カメラ要求パラメータ:', constraints);
            this.videoStream = await navigator.mediaDevices.getUserMedia(constraints);
            console.log('カメラストリーム取得成功:', this.videoStream);
            
            this.videoElement.srcObject = this.videoStream;
            console.log('ビデオ要素にストリームをセット');
            
            // ビデオ再生開始
            return new Promise((resolve) => {
                this.videoElement.onloadedmetadata = () => {
                    console.log('ビデオメタデータ読み込み完了');
                    this.videoElement.play()
                        .then(() => {
                            console.log('ビデオ再生開始成功');
                            // キャンバスサイズの設定
                            this.canvasElement.width = this.videoElement.videoWidth;
                            this.canvasElement.height = this.videoElement.videoHeight;
                            console.log(`ビデオサイズ: ${this.canvasElement.width}x${this.canvasElement.height}`);
                            resolve();
                        })
                        .catch(error => {
                            console.error("ビデオ再生エラー:", error);
                            resolve(); // エラーでも続行
                        });
                };
            });
        } catch (error) {
            console.error("カメラ起動エラー:", error);
            throw error;
        }
    },
    
    // カメラ停止
    stopCamera() {
        if (this.videoStream) {
            this.videoStream.getTracks().forEach(track => track.stop());
            this.videoElement.srcObject = null;
            this.videoStream = null;
        }
    },
    
    // ビデオフレームをスキャン
    async scanVideoFrame() {
        if (!this.isScanning || this.videoElement.readyState !== this.videoElement.HAVE_ENOUGH_DATA) {
            return;
        }
        
        try {
            // 現在時刻を取得
            const now = Date.now();
            
            // 前回の検出から500ms以内なら処理をスキップ（頻度制限）
            if (now - this.lastDetection < 500) {
                return;
            }
            
            // ビデオフレームをキャンバスに描画
            this.canvasContext.drawImage(
                this.videoElement, 
                0, 0, 
                this.canvasElement.width, 
                this.canvasElement.height
            );
            
            // キャンバスからイメージデータを取得
            const imageData = this.canvasContext.getImageData(
                0, 0, 
                this.canvasElement.width, 
                this.canvasElement.height
            );
            
            // jsQRライブラリを使用してQRコードを検出
            if (typeof jsQR === 'function') {
                try {
                    const code = jsQR(
                        imageData.data,
                        imageData.width,
                        imageData.height,
                        {
                            inversionAttempts: "dontInvert",  // 白黒反転の試行を減らして速度向上
                        }
                    );
                    
                    if (code) {
                        console.log('jsQRで検出:', code.data);
                        
                        // 重複チェック
                        const isDuplicate = this.detectedCodes.some(item => item.data === code.data);
                        
                        if (!isDuplicate) {
                            this.detectedCodes.push({
                                id: Date.now() + Math.random().toString(36).substring(2, 9),
                                data: code.data,
                                format: 'QR_CODE',
                                timestamp: new Date().toISOString()
                            });
                            
                            this.lastDetection = now;
                            this.playBeepSound();
                            this.updateResultsUI();
                            this.updateStatus(`${this.detectedCodes.length}個のQRコードを検出`, 'success');
                        } else {
                            // 重複した場合も検出時刻を更新（連続検出の抑制のため）
                            this.lastDetection = now;
                        }
                    }
                } catch (jsQRError) {
                    console.warn('jsQRデコードエラー:', jsQRError);
                }
            }
            
        } catch (error) {
            console.error('スキャン処理エラー:', error);
        }
    },
    
    // UI表示を更新
    updateResultsUI() {
        if (!this.resultsList) return;
        
        this.resultsList.innerHTML = '';
        
        if (this.detectedCodes.length === 0) {
            this.resultsList.innerHTML = '<p class="empty-message">QRコードが検出されていません</p>';
            return;
        }
        
        this.detectedCodes.forEach((code, index) => {
            const item = document.createElement('div');
            item.className = 'qr-result-item';
            
            // 時刻フォーマット
            const date = new Date(code.timestamp);
            const formattedTime = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
            
            item.innerHTML = `
                <div class="qr-result-header">
                    <span class="qr-result-number">#${index + 1}</span>
                    <button class="qr-result-remove" data-id="${code.id}">✕</button>
                </div>
                <div class="qr-result-data">${code.data}</div>
                <div class="qr-result-meta">
                    <span class="qr-result-time">${formattedTime}</span>
                </div>
            `;
            
            this.resultsList.appendChild(item);
        });
        
        // 削除ボタンのイベント設定
        const removeButtons = this.resultsList.querySelectorAll('.qr-result-remove');
        removeButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');
                this.detectedCodes = this.detectedCodes.filter(code => code.id !== id);
                this.updateResultsUI();
                this.updateStatus(`${this.detectedCodes.length}個のQRコードを検出`, 
                    this.detectedCodes.length > 0 ? 'success' : 'stopped');
            });
        });
    },
    
    // 状態表示の更新
    updateStatus(message, statusClass) {
        if (this.statusElement) {
            this.statusElement.textContent = message;
            this.statusElement.className = 'detection-status';
            if (statusClass) {
                this.statusElement.classList.add(statusClass);
            }
        }
    },
    
    // ボタン状態の更新
    updateButtonState(isScanning) {
        const startBtn = document.getElementById('start-multi-scan');
        const stopBtn = document.getElementById('stop-multi-scan');
        
        if (startBtn) startBtn.disabled = isScanning;
        if (stopBtn) stopBtn.disabled = !isScanning;
    },
    
    // 検出結果の保存
    saveDetectedCodes() {
        if (this.detectedCodes.length === 0) {
            if (typeof App !== 'undefined' && App.showToast) {
                App.showToast('保存するQRコードがありません');
            }
            return;
        }
        
        // App.jsのsaveScannedData関数を利用して保存
        if (typeof App !== 'undefined') {
            this.detectedCodes.forEach(code => {
                App.saveScannedData(code.data);
            });
            
            App.showToast(`${this.detectedCodes.length}個のQRコードを保存しました`);
            App.displayHistory(); // 履歴表示を更新
        }
        
        // 検出リストをクリア
        this.detectedCodes = [];
        this.updateResultsUI();
        this.updateStatus('スキャン中...', 'scanning');
    },
    
    // ビープ音の再生
    playBeepSound() {
        try {
            // Web Audio APIを使用
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.type = 'square';
            oscillator.frequency.value = 800;
            gainNode.gain.value = 0.3;
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.start(0);
            
            // 短いビープ音
            setTimeout(() => {
                oscillator.stop();
            }, 150);
            
        } catch (error) {
            console.error("ビープ音の再生に失敗:", error);
        }
    },
    
    // ビュー表示
    showMultiScanView() {
        console.log('showMultiScanViewが呼び出されました');
        
        // 要素の存在を確認
        const multiContainer = document.getElementById('multi-qr-container');
        console.log('multi-qr-container要素:', multiContainer);
        
        if (multiContainer) {
            console.log('multi-qr-container表示前のスタイル:', multiContainer.style.display);
            // キャプチャUIをアクティブに
            multiContainer.style.display = 'block';
            console.log('multi-qr-container表示後のスタイル:', multiContainer.style.display);
            
            // イベントリスナーを再設定
            this.setupEventListeners();
            
            // 他のビューを非表示
            const otherViews = document.querySelectorAll('.view-container:not(#multi-qr-container)');
            console.log('他のビュー数:', otherViews.length);
            otherViews.forEach(view => {
                view.style.display = 'none';
            });
        } else {
            console.error('multi-qr-container要素が見つかりません');
        }
    }
};