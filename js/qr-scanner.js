// QRコードスキャナー機能
const QRScanner = {
    // 状態管理
    isScanning: false,
    videoElement: null,
    canvasElement: null,
    canvasContext: null,
    videoStream: null,
    scanInterval: null,
    isProcessing: false, // スキャン処理中かどうかのフラグ
    lastScannedCode: null, // 最後にスキャンされたコード
    
    // 一括スキャン用
    isBatchMode: false,
    batchResults: [],
    
    // 初期化
    init() {
        // ビデオ要素の参照
        this.videoElement = document.getElementById('qr-video');
        
        // キャンバス要素の作成（オフスクリーンレンダリング用）
        this.canvasElement = document.createElement('canvas');
        this.canvasContext = this.canvasElement.getContext('2d', { willReadFrequently: true });
        
        // 利用可能なカメラを列挙
        this.listCameras();
        
        // 状態表示要素の参照
        this.scanStatusElement = document.getElementById('scan-status');
    },
    
    // QRスキャン開始
    async start() {
        if (this.isScanning) return Promise.resolve();
        
        try {
            // 状態表示の更新
            this.updateScanStatus('カメラ起動中...');
            
            // カメラストリームの取得
            const constraints = { 
                video: { 
                    facingMode: 'environment', // 背面カメラを優先
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                } 
            };
            
            // カメラが選択されている場合はその値を使用
            const cameraSelect = document.getElementById('camera-select');
            if (cameraSelect.value) {
                constraints.video.deviceId = { exact: cameraSelect.value };
            }
            
            this.videoStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoElement.srcObject = this.videoStream;
            
            // ビデオ再生開始
            await new Promise((resolve) => {
                this.videoElement.onloadedmetadata = () => {
                    this.videoElement.play()
                        .then(() => resolve())
                        .catch(error => {
                            console.error("ビデオ再生エラー:", error);
                            resolve(); // エラーでも続行
                        });
                };
            });
            
            // キャンバスサイズの設定
            this.canvasElement.width = this.videoElement.videoWidth;
            this.canvasElement.height = this.videoElement.videoHeight;
            
            // QRコードスキャン処理の定期実行
            this.isScanning = true;
            this.isProcessing = false;
            this.scanInterval = setInterval(() => this.scanVideoFrame(), 200);
            
            // 状態表示の更新
            this.updateScanStatus('スキャン中...');
            
            return Promise.resolve();
            
        } catch (error) {
            console.error("QRスキャナー起動エラー:", error);
            this.updateScanStatus('カメラエラー');
            return Promise.reject(error);
        }
    },
    
    // QRスキャン停止
    stop() {
        if (!this.isScanning) return;
        
        // スキャン処理の停止
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }
        
        // カメラストリームの停止
        if (this.videoStream) {
            this.videoStream.getTracks().forEach(track => track.stop());
            this.videoStream = null;
        }
        
        this.videoElement.srcObject = null;
        this.isScanning = false;
        this.isProcessing = false;
        
        // 状態表示の更新
        this.updateScanStatus('停止中');
    },
    
    // 一括スキャンモードの切り替え
    toggleBatchMode(enabled) {
        this.isBatchMode = enabled;
        
        if (enabled) {
            this.batchResults = [];
            // バッチモードUI表示
            document.getElementById('batch-scan-container').classList.remove('hidden');
            document.getElementById('batch-count').textContent = '0件';
            document.getElementById('batch-items').innerHTML = '';
            
            // 状態表示の更新
            this.updateScanStatus('一括スキャン中...');
        } else {
            // バッチモードUI非表示
            document.getElementById('batch-scan-container').classList.add('hidden');
        }
        
        console.log("一括スキャンモード:", enabled ? "オン" : "オフ");
    },
    
    // ビデオフレームからQRコードをスキャン
    scanVideoFrame() {
        if (!this.isScanning || this.videoElement.readyState !== this.videoElement.HAVE_ENOUGH_DATA) {
            return;
        }
        
        // すでに処理中の場合はスキップ
        if (this.isProcessing) {
            return;
        }
        
        try {
            // ビデオフレームをキャンバスに描画
            this.canvasContext.drawImage(
                this.videoElement, 
                0, 0, 
                this.canvasElement.width, 
                this.canvasElement.height
            );
            
            // キャンバスから画像データを取得
            const imageData = this.canvasContext.getImageData(
                0, 0, 
                this.canvasElement.width, 
                this.canvasElement.height
            );
            
            // jsQRライブラリでQRコードを検出
            const code = jsQR(
                imageData.data, 
                imageData.width, 
                imageData.height, 
                {
                    inversionAttempts: "dontInvert",
                }
            );
            
            // QRコードが見つかった場合
            if (code) {
                console.log("QRコード検出:", code.data);
                
                // スキャン音の再生
                this.playBeepSound();
                
                if (this.isBatchMode) {
                    // 一括モードの場合は結果を確認
                    const isDuplicate = this.batchResults.some(item => item.data === code.data);
                    
                    if (isDuplicate) {
                        // 重複の場合はUIに表示だけ
                        this.lastScannedCode = code.data;
                        App.showDuplicateNotification(code.data);
                    } else {
                        // 新規の場合はリストに追加
                        const timestamp = new Date().toISOString();
                        this.batchResults.push({
                            id: Date.now().toString(),
                            data: code.data,
                            timestamp: timestamp
                        });
                        
                        // UI更新
                        App.updateBatchUI(this.batchResults);
                    }
                    
                    // 処理中フラグを設定して一時的にスキャンを停止
                    this.isProcessing = true;
                    this.updateScanStatus(`読み取り${isDuplicate ? '(重複)' : '成功'}... 準備中`);
                    
                    // 短時間後に再スキャン可能にする
                    setTimeout(() => {
                        this.isProcessing = false;
                        this.updateScanStatus('スキャン中...');
                    }, 1500); // 1.5秒後に再開
                } else {
                    // 通常モード
                    App.showScanResult(code.data);
                    this.stop();
                }
            }
            
        } catch (error) {
            console.error("QRスキャン処理エラー:", error);
            this.isProcessing = false;
        }
    },
    
    // スキャン状態の更新
    updateScanStatus(statusText) {
        if (this.scanStatusElement) {
            this.scanStatusElement.textContent = statusText;
            
            // 状態に応じたクラスを設定
            this.scanStatusElement.className = 'scan-status';
            if (statusText.includes('スキャン中')) {
                this.scanStatusElement.classList.add('scanning');
            } else if (statusText.includes('成功')) {
                this.scanStatusElement.classList.add('success');
            } else if (statusText.includes('重複')) {
                this.scanStatusElement.classList.add('duplicate');
            } else if (statusText.includes('準備中')) {
                this.scanStatusElement.classList.add('processing');
            } else if (statusText.includes('停止')) {
                this.scanStatusElement.classList.add('stopped');
            } else if (statusText.includes('エラー')) {
                this.scanStatusElement.classList.add('error');
            }
        }
    },
    
    // 利用可能なカメラデバイスの列挙
    async listCameras() {
        try {
            const cameraSelect = document.getElementById('camera-select');
            
            // MediaDevices APIが利用可能か確認
            if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
                console.log("カメラデバイスの列挙がサポートされていません");
                return;
            }
            
            // デバイスの列挙
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            
            // セレクトボックスをクリア
            cameraSelect.innerHTML = '<option value="">カメラを選択</option>';
            
            // 利用可能なカメラをリストに追加
            videoDevices.forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `カメラ ${index + 1}`;
                cameraSelect.appendChild(option);
            });
            
            // カメラが1つしかない場合は自動選択
            if (videoDevices.length === 1) {
                cameraSelect.value = videoDevices[0].deviceId;
            }
            
            // カメラ選択変更時の処理
            cameraSelect.addEventListener('change', () => {
                // スキャン中なら再起動
                if (this.isScanning) {
                    this.stop();
                    this.start();
                }
            });
            
        } catch (error) {
            console.error("カメラの列挙に失敗:", error);
        }
    },
    
    // スキャン成功時のビープ音再生
    playBeepSound() {
        try {
            // Web Audio APIを使用してビープ音を生成
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.type = 'square';
            oscillator.frequency.value = 800;
            gainNode.gain.value = 0.1;
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.start(0);
            
            // 短いビープ音
            setTimeout(() => {
                oscillator.stop();
            }, 100);
            
        } catch (error) {
            console.error("ビープ音の再生に失敗:", error);
        }
    }
};