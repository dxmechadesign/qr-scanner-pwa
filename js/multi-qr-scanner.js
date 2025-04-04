// 複数QRコード検出スキャナー (ZXing実装)
const MultiQRScanner = {
    // 状態管理
    capturedImage: null,     // 撮影した画像
    detectedCodes: [],       // 検出したQRコード
    reader: null,            // ZXingリーダーインスタンス
    processing: false,       // 処理中フラグ
    
    // 初期化
    async init() {
        console.log('MultiQRScanner: 初期化開始');
        
        // 要素の参照
        this.videoElement = document.getElementById('multi-qr-video');
        this.canvasElement = document.createElement('canvas');
        this.canvasContext = this.canvasElement.getContext('2d');
        this.captureButton = document.getElementById('capture-button');
        this.resultsList = document.getElementById('detected-codes-list');
        this.statusElement = document.getElementById('detection-status');
        
        // ZXingの利用可能性をチェック
        if (typeof window.ZXing === 'undefined') {
            console.error('ZXingライブラリが利用できません');
            console.log('window.ZXing:', window.ZXing);
            console.log('window keys:', Object.keys(window).filter(k => k.includes('ZXing')));
            
            // エラーを表示するが、アプリは継続させる
            if (typeof App !== 'undefined' && App.showToast) {
                App.showToast('複数QRコード機能は利用できません');
            } else {
                alert('複数QRコード機能は利用できません');
            }
            return;
        }

        try {
            console.log('ZXingリーダーを初期化中...');
            
            // ヒントマップの設定
            const hints = new Map();
            
            // グローバルオブジェクトから直接アクセス
            const ZXing = window.ZXing;
            
            if (!ZXing.DecodeHintType) {
                console.error('DecodeHintType が見つかりません');
                console.log('ZXing object:', ZXing);
                throw new Error('ZXingの必要なプロパティが見つかりません');
            }
            
            hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.QR_CODE]);
            hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
            
            // リーダーの初期化
            this.reader = new ZXing.BrowserMultiFormatReader(hints);
            console.log('ZXingリーダーの初期化完了');
            
            // イベントリスナーの設定
            this.setupEventListeners();
            
            console.log('MultiQRScanner: 初期化完了');
        } catch (error) {
            console.error('ZXingリーダーの初期化エラー:', error);
            alert('QRコード検出機能の初期化に失敗しました: ' + error.message);
        }
    },
    
    // イベントリスナーのセットアップ
    setupEventListeners() {
        console.log('MultiQRScanner: イベントリスナーをセットアップ中...')
        
        // 撮影ボタン - すでに設定済みのリスナーを削除
        this.captureButton.removeEventListener('click', this._captureHandler);
        
        // ハンドラー関数を定義
        this._captureHandler = () => {
            console.log('撮影ボタンがクリックされました');
            this.captureImage();
        };
        
        // リスナーを追加
        this.captureButton.addEventListener('click', this._captureHandler);
        console.log('撮影ボタンのリスナーを設定しました');
        
        // 再撮影ボタン
        const rescanButton = document.getElementById('rescan-button');
        if (rescanButton) {
            rescanButton.removeEventListener('click', this._rescanHandler);
            this._rescanHandler = () => this.showCaptureUI();
            rescanButton.addEventListener('click', this._rescanHandler);
        }
        
        // 保存ボタン
        const saveButton = document.getElementById('save-results-button');
        if (saveButton) {
            saveButton.removeEventListener('click', this._saveHandler);
            this._saveHandler = () => this.saveDetectedCodes();
            saveButton.addEventListener('click', this._saveHandler);
        }
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
                    // 解像度をより適切な値に調整
                    width: { ideal: 1280 }, // 元は1920
                    height: { ideal: 720 }  // 元は1080
                    // ズーム制限を追加
                    // advanced: [{ zoom: 1.0 }] // 一部のブラウザでサポート
                } 
            };
            
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoElement.srcObject = stream;
            
            // ズーム設定のリセットを試みる（サポートされている場合）
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack && typeof videoTrack.getCapabilities === 'function') {
                const capabilities = videoTrack.getCapabilities();
                if (capabilities.zoom) {
                    const settings = { zoom: 1.0 }; // 最小ズーム
                    try {
                        await videoTrack.applyConstraints({ advanced: [settings] });
                    } catch (e) {
                        console.log('ズーム設定の適用に失敗:', e);
                    }
                }
            }

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

        try {
            // キャンバスサイズをビデオの実際のサイズに合わせる
            const videoWidth = this.videoElement.videoWidth;
            const videoHeight = this.videoElement.videoHeight;
            
            console.log(`ビデオサイズ: ${videoWidth}x${videoHeight}`);
            
            if (videoWidth === 0 || videoHeight === 0) {
              this.showError('ビデオサイズが取得できません');
              this.processing = false;
              return;
            }
            
            this.canvasElement.width = videoWidth;
            this.canvasElement.height = videoHeight;
            
            // ビデオフレームをキャンバスに描画
            this.canvasContext.drawImage(
              this.videoElement, 
              0, 0, 
              videoWidth, videoHeight
            );
            
            // 画質を調整 (0.8は画質と容量のバランス)
            this.capturedImage = this.canvasElement.toDataURL('image/jpeg', 0.8);
            
            // デバッグ用に画像サイズを表示
            const img = new Image();
            img.src = this.capturedImage;
            img.onload = () => {
              console.log(`キャプチャした画像のサイズ: ${img.width}x${img.height}`);
            };
            
            // プレビュー表示
            document.getElementById('captured-image').src = this.capturedImage;
            
            // 結果UIに切り替え
            this.showResultsUI();
            
            // QRコード検出処理
            this.detectQRCodes();
          } catch (error) {
            console.error('画像キャプチャエラー:', error);
            this.showError('画像の撮影に失敗しました');
            this.processing = false;
          }
    },
    
    // detectQRCodes メソッド内の処理を改善
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
        
        console.log('画像サイズ:', img.width, img.height);
        
        // 画像が正しく読み込まれているか確認
        if (img.width === 0 || img.height === 0) {
            throw new Error('画像が正しく読み込まれていません');
        }
        
        console.log('QRコード検出開始...');
        
        try {
            // ZXingで検出を試みる
            const results = await this.reader.decodeMultiple(img);
            console.log('検出結果:', results);
            
            // 結果を処理
            if (results && results.length > 0) {
            this.detectedCodes = results.map(result => ({
                id: Date.now() + Math.random().toString(36).substring(2, 9),
                data: result.getText(),
                format: result.getBarcodeFormat().toString(),
                timestamp: new Date().toISOString()
            }));
            
            console.log(`${this.detectedCodes.length}個のQRコードを検出`);
            } else {
            console.log('QRコードが検出されませんでした');
            this.detectedCodes = [];
            }
        } catch (decodeError) {
            console.error('QRコード検出エラー (ZXing):', decodeError);
            this.detectedCodes = [];
        }
        
        // UI更新
        this.updateResultsUI();
        
        // 処理完了表示
        this.statusElement.textContent = 
            `${this.detectedCodes.length}個のQRコードを検出しました`;
        this.statusElement.className = this.detectedCodes.length > 0 ? 
            'detection-status success' : 'detection-status error';
        
        } catch (error) {
        console.error('QRコード検出処理エラー:', error);
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