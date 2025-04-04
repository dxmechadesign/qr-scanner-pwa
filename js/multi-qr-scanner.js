// 複数QRコード検出スキャナー (ZXing実装)
const MultiQRScanner = {
    // 状態管理
    capturedImage: null,     // 撮影した画像
    detectedCodes: [],       // 検出したQRコード
    reader: null,            // ZXingリーダーインスタンス
    processing: false,       // 処理中フラグ
    
    // 初期化
    async init() {
        console.log('MultiQRScanner: 初期化中...');
        // 要素の参照
        this.videoElement = document.getElementById('multi-qr-video');
        this.canvasElement = document.createElement('canvas');
        this.canvasContext = this.canvasElement.getContext('2d');
        this.captureButton = document.getElementById('capture-button');
        this.resultsList = document.getElementById('detected-codes-list');
        this.statusElement = document.getElementById('detection-status');
        
        // ZXingライブラリの動的インポート
        try {
            console.log('ZXingライブラリを読み込み中...');
            // 注: 実際の環境では、下記のインポート文を適切に調整してください
            const ZXing = await import('@zxing/library');
            const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } = ZXing;
            
            // ヒントマップの設定
            const hints = new Map();
            hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
            hints.set(DecodeHintType.TRY_HARDER, true);
            
            // マルチフォーマットリーダーの初期化
            this.reader = new BrowserMultiFormatReader(hints);
            console.log('ZXingリーダーの初期化完了');
            
            // イベントリスナーの設定
            this.setupEventListeners();
            
        } catch (error) {
            console.error('ZXingライブラリの読み込みに失敗:', error);
            this.showError('QRコード検出機能の初期化に失敗しました');
        }
    },
    
    // イベントリスナーのセットアップ
    setupEventListeners() {
        // 撮影ボタン
        this.captureButton.addEventListener('click', () => {
            if (this.processing) return;
            
            if (document.getElementById('capture-ui').classList.contains('active')) {
                this.captureImage();
            } else {
                this.showCaptureUI();
            }
        });
        
        // 再撮影ボタン
        document.getElementById('rescan-button').addEventListener('click', () => {
            this.showCaptureUI();
        });
        
        // 保存ボタン
        document.getElementById('save-results-button').addEventListener('click', () => {
            this.saveDetectedCodes();
        });
    },
    
    // カメラUIを表示
    async showCaptureUI() {
        document.getElementById('capture-ui').classList.add('active');
        document.getElementById('results-ui').classList.remove('active');
        this.captureButton.textContent = '撮影';
        
        try {
            await this.startCamera();
        } catch (error) {
            this.showError('カメラへのアクセスに失敗しました');
        }
    },
    
    // 結果UIを表示
    showResultsUI() {
        document.getElementById('capture-ui').classList.remove('active');
        document.getElementById('results-ui').classList.add('active');
        
        // カメラを停止
        this.stopCamera();
    },
    
    // カメラ起動
    async startCamera() {
        try {
            const constraints = { 
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                } 
            };
            
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoElement.srcObject = stream;
            
            return new Promise((resolve) => {
                this.videoElement.onloadedmetadata = () => {
                    this.videoElement.play()
                        .then(resolve)
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
        if (this.videoElement.srcObject) {
            this.videoElement.srcObject.getTracks().forEach(track => track.stop());
            this.videoElement.srcObject = null;
        }
    },
    
    // 画像キャプチャ
    captureImage() {
        if (this.videoElement.readyState !== this.videoElement.HAVE_ENOUGH_DATA) {
            this.showError('カメラの準備ができていません');
            return;
        }
        
        this.processing = true;
        
        // キャンバスサイズを設定
        this.canvasElement.width = this.videoElement.videoWidth;
        this.canvasElement.height = this.videoElement.videoHeight;
        
        // ビデオフレームをキャンバスに描画
        this.canvasContext.drawImage(
            this.videoElement, 
            0, 0, 
            this.canvasElement.width, 
            this.canvasElement.height
        );
        
        // キャプチャした画像を保存
        this.capturedImage = this.canvasElement.toDataURL('image/jpeg', 0.9);
        
        // プレビュー表示
        document.getElementById('captured-image').src = this.capturedImage;
        
        // 結果UIに切り替え
        this.showResultsUI();
        
        // QRコード検出処理
        this.detectQRCodes();
    },
    
    // QRコード検出
    async detectQRCodes() {
        if (!this.reader || !this.capturedImage) {
            this.processing = false;
            return;
        }
        
        try {
            // 処理中表示
            this.statusElement.textContent = 'QRコード検出中...';
            this.statusElement.className = 'detection-status processing';
            
            // 画像要素の作成
            const img = new Image();
            img.src = this.capturedImage;
            
            await new Promise(resolve => {
                img.onload = resolve;
            });
            
            console.log('画像読み込み完了、QRコード検出を開始...');
            
            // ZXingで複数QRコード検出
            const results = await this.reader.decodeMultiple(img);
            
            // 検出結果を保存
            this.detectedCodes = results.map(result => ({
                id: Date.now() + Math.random().toString(36).substring(2, 9),
                data: result.getText(),
                format: result.getBarcodeFormat().toString(),
                timestamp: new Date().toISOString()
            }));
            
            console.log(`${this.detectedCodes.length}個のQRコードを検出:`, this.detectedCodes);
            
            // UI更新
            this.updateResultsUI();
            
            // 処理完了表示
            this.statusElement.textContent = 
                `${this.detectedCodes.length}個のQRコードを検出しました`;
            this.statusElement.className = 'detection-status success';
            
        } catch (error) {
            console.error('QRコード検出エラー:', error);
            this.statusElement.textContent = 'QRコードが見つかりませんでした';
            this.statusElement.className = 'detection-status error';
            this.detectedCodes = [];
            this.updateResultsUI();
        } finally {
            this.processing = false;
        }
    },
    
    // 結果UI更新
    updateResultsUI() {
        this.resultsList.innerHTML = '';
        
        if (this.detectedCodes.length === 0) {
            this.resultsList.innerHTML = '<p class="empty-message">QRコードが検出されませんでした</p>';
            return;
        }
        
        this.detectedCodes.forEach((code, index) => {
            const item = document.createElement('div');
            item.className = 'qr-result-item';
            
            // 日時の整形
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
                    <span class="qr-result-format">${code.format}</span>
                </div>
            `;
            
            this.resultsList.appendChild(item);
        });
        
        // 削除ボタンのイベントリスナー
        document.querySelectorAll('.qr-result-remove').forEach(button => {
            button.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');
                this.detectedCodes = this.detectedCodes.filter(code => code.id !== id);
                this.updateResultsUI();
                
                this.statusElement.textContent = 
                    `${this.detectedCodes.length}個のQRコードを検出しました`;
            });
        });
    },
    
    // 検出結果の保存
    saveDetectedCodes() {
        if (this.detectedCodes.length === 0) {
            this.showToast('保存するQRコードがありません');
            return;
        }
        
        // ここでApp.jsのsaveScannedData関数を利用
        this.detectedCodes.forEach(code => {
            App.saveScannedData(code.data);
        });
        
        this.showToast(`${this.detectedCodes.length}個のQRコードを保存しました`);
        
        // 履歴を更新
        App.displayHistory();
        
        // 初期状態に戻す
        this.detectedCodes = [];
        this.capturedImage = null;
        this.showCaptureUI();
    },
    
    // トースト通知表示
    showToast(message) {
        // App.jsのshowToast関数を利用
        App.showToast(message);
    },
    
    // エラー表示
    showError(message) {
        console.error(message);
        this.showToast(message);
    }
};

// DOMコンテンツ読み込み完了時に初期化
document.addEventListener('DOMContentLoaded', () => {
    // MultiQRScannerの初期化は、App.initの中から呼び出す想定
    // または、直接呼び出す場合は:
    // MultiQRScanner.init();
});