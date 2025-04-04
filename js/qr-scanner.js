// QRコードスキャナー機能
const QRScanner = {
    // 状態管理
    isScanning: false,
    videoElement: null,
    canvasElement: null,
    canvasContext: null,
    videoStream: null,
    scanInterval: null,
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
    },
    
    // QRスキャン開始
    async start() {
        if (this.isScanning) return Promise.resolve();
        
        try {
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
                    this.videoElement.play();
                    resolve();
                };
            });
            
            // キャンバスサイズの設定
            this.canvasElement.width = this.videoElement.videoWidth;
            this.canvasElement.height = this.videoElement.videoHeight;
            
            // QRコードスキャン処理の定期実行
            this.isScanning = true;
            this.scanInterval = setInterval(() => this.scanVideoFrame(), 200);
            
            return Promise.resolve();
            
        } catch (error) {
            console.error("QRスキャナー起動エラー:", error);
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
    },
    
    // ビデオフレームからQRコードをスキャン
    scanVideoFrame() {
        if (!this.isScanning || !this.videoElement.readyState === this.videoElement.HAVE_ENOUGH_DATA) {
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
            
            // jsQRライブラリでQRコードを検出（外部ライブラリ依存）
            // 注: jsQR.jsをインクルードする必要があります
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
                
                // スキャン音の再生（オプション）
                this.playBeepSound();
                
                // スキャン結果の通知
                App.showScanResult(code.data);
                
                // スキャンを一時停止
                this.stop();
            }
            
        } catch (error) {
            console.error("QRスキャン処理エラー:", error);
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
        } else {
        // バッチモードUI非表示
        document.getElementById('batch-scan-container').classList.add('hidden');
        }
    },
  
    // scanVideoFrame() メソッド内の変更部分
    if (code) {
        console.log("QRコード検出:", code.data);
        
        // スキャン音の再生
        this.playBeepSound();
        
        if (this.isBatchMode) {
        // 一括モードの場合は結果を追加
        if (!this.batchResults.some(item => item.data === code.data)) {
            this.batchResults.push({
            id: Date.now().toString(),
            data: code.data,
            timestamp: new Date().toISOString()
            });
            
            // UI更新
            App.updateBatchUI(this.batchResults);
            
            // 短時間停止してから再開（連続読み取り防止）
            this.stop();
            setTimeout(() => {
            this.start();
            }, 1000);
        }
        } else {
        // 通常モード - 既存のコード
        App.showScanResult(code.data);
        this.stop();
        }
    }
};