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
    tryLowerResolution: false, // 低解像度を試すフラグ

    // 画像処理パラメータを調整
    imageProcessing: {
        enabled: true,
        contrastFactor: 1.6,       // コントラストを強くする（1.4→1.6）
        sharpeningEnabled: true,   
        thresholdEnabled: true,    
        regionSize: 25,            // 局所領域サイズを大きくする（15→25）
        thresholdConstant: 8,      // 閾値定数を大きくする（5→8）
        useGrayscale: true,
        adaptiveThreshold: true,   // 新たに適応的閾値処理を追加
        edgeEnhancement: true,     // エッジ強調処理を追加
        debug: false
    },

    // OpenCV初期化状態を追跡 (ここに追加)
    isOpenCVReady: false,
    processingMode: 'hybrid', // 'hybrid' または 'legacy'

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

            // 設定の読み込み
            this.loadImageProcessingSettings();

            // OpenCV初期化状態を確認（ここに追加）
            this.setupOpenCV();
            
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
                console.log('ZXingライブラリが利用できません。jsQRを使用します');
                this.reader = null;
            } else {
                try {
                    console.log('ZXingリーダーを初期化中...');
                    
                    // ZXingライブラリのバージョン確認
                    const ZXing = window.ZXing;
                    console.log('ZXingライブラリのバージョン:', ZXing);
                    
                    // ヒントの初期化
                    const hints = new Map();
                    
                    // リーダーの初期化（バージョンによって異なる）
                    if (ZXing.BrowserMultiFormatReader) {
                        console.log('BrowserMultiFormatReaderを使用');
                        
                        // 新しいバージョン用の初期化
                        try {
                            this.reader = new ZXing.BrowserMultiFormatReader();
                            console.log('新しいZXing APIで初期化しました');
                        } catch (initError) {
                            console.warn('新しいZXing API初期化エラー:', initError);
                            
                            // 古いバージョン用の初期化を試行
                            try {
                                if (ZXing.DecodeHintType && ZXing.BarcodeFormat) {
                                    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.QR_CODE]);
                                    hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
                                    this.reader = new ZXing.BrowserMultiFormatReader(hints);
                                    console.log('古いZXing APIで初期化しました');
                                }
                            } catch (oldApiError) {
                                console.warn('古いZXing API初期化エラー:', oldApiError);
                                this.reader = null;
                            }
                        }
                    } else {
                        console.log('ZXingの互換APIが見つかりません。jsQRを使用します');
                        this.reader = null;
                    }
                    
                    if (this.reader) {
                        console.log('ZXingリーダー初期化成功:', this.reader);
                    }
                } catch (error) {
                    console.error('ZXingリーダーの初期化エラー:', error);
                    this.reader = null;
                }
            }
            
            // イベントリスナーの設定
            this.setupEventListeners();
            
            console.log('MultiQRScanner: 初期化完了');
            resolve();
        });
    },

    // OpenCV初期化の設定（新規追加）
    setupOpenCV() {
        // すでに読み込まれているか確認
        if (typeof cv !== 'undefined') {
            this.isOpenCVReady = true;
            console.log('OpenCV.js が既に読み込まれています');
            return;
        }
        
        // イベントリスナーを設定
        document.addEventListener('opencv-ready', () => {
            this.isOpenCVReady = true;
            console.log('OpenCV.js が正常に読み込まれました');
        });
        
        console.log('OpenCV.js の読み込みを待機中...');
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
    startScanning() {
        if (this.isScanning) return;
        
        try {
            console.log('複数QRスキャン開始...');
            
            // スキャン準備中表示
            this.updateStatus('カメラ準備中...', 'processing');
            
            // カメラの起動
            this.startCamera()
                .then(() => {
                    // スキャン開始
                    this.isScanning = true;
                    
                    // ボタン状態の更新
                    this.updateButtonState(true);
                    
                    // 既存のスキャンインターバルをクリア
                    if (this.scanInterval) {
                        clearInterval(this.scanInterval);
                        this.scanInterval = null;
                    }
                    
                    // ハイブリッドスキャンを開始 (ここを変更)
                    this.hybridScan();
                    
                    // スキャン中表示
                    this.updateStatus('スキャン中...', 'scanning');
                })
                .catch(error => {
                    console.error('スキャン開始エラー:', error);
                    this.updateStatus('カメラ起動エラー', 'error');
                    this.isScanning = false;
                });
        } catch (error) {
            console.error('スキャン開始エラー:', error);
            this.updateStatus('カメラ起動エラー', 'error');
            this.isScanning = false;
        }
    },
    
    // 既存のstopScanningメソッドを改善
    stopScanning() {
        if (!this.isScanning) return;
        
        console.log('複数QRスキャン停止');
        
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
    
    // カメラ起動（改良版）
    async startCamera() {
        console.log('カメラ起動開始...');
        try {
            // すでにアクティブなストリームがある場合は停止
            this.stopCamera();
            
            // グローバル変数がなければ初期化
            if (!window.activeMediaStreams) {
                window.activeMediaStreams = [];
            }
            
            // シンプルな制約でまず試行
            const simpleConstraints = {
                video: { 
                    facingMode: 'environment'
                }
            };
            
            // グローバルにすべてのメディアストリームを停止
            if (typeof window.releaseAllCameras === 'function') {
                await window.releaseAllCameras();
                console.log('すべてのカメラリソースを解放しました');
            } else {
                // 従来の方法でカメラを停止
                this.stopCamera();
                
                // 他のビデオ要素のストリームも停止
                document.querySelectorAll('video').forEach(video => {
                    if (video.srcObject) {
                        const stream = video.srcObject;
                        if (stream && stream.getTracks) {
                            stream.getTracks().forEach(track => {
                                track.stop();
                            });
                        }
                        video.srcObject = null;
                    }
                });
                
                // しばらく待機
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // シンプルな設定でカメラを取得
            console.log('シンプルな設定でカメラを試行します');
            const stream = await navigator.mediaDevices.getUserMedia(simpleConstraints);
            
            // グローバル変数に追加して管理
            if (!window.activeMediaStreams) {
                window.activeMediaStreams = [];
            }
            window.activeMediaStreams.push(stream);
            
            // ストリームをセット
            this.videoStream = stream;
            
            // ビデオ要素に設定する前にもう一度クリア
            if (this.videoElement) {
                this.videoElement.srcObject = null;
                await new Promise(resolve => setTimeout(resolve, 100));
                
                this.videoElement.srcObject = stream;
                console.log('ビデオ要素にストリームをセット');
                
                // ビデオ再生開始
                return new Promise((resolve, reject) => {
                    const timeoutId = setTimeout(() => {
                        console.warn('ビデオのロードがタイムアウトしました');
                        // タイムアウトした場合でも続行を試みる
                        this.canvasElement.width = 640;
                        this.canvasElement.height = 480;
                        this.updateStatus('準備完了、スキャンを開始します', 'scanning');
                        resolve();
                    }, 3000);
                    
                    this.videoElement.onloadedmetadata = () => {
                        clearTimeout(timeoutId);
                        console.log('ビデオメタデータ読み込み完了');
                        
                        this.videoElement.play()
                            .then(() => {
                                console.log('ビデオ再生開始成功');
                                // キャンバスサイズの設定
                                this.canvasElement.width = this.videoElement.videoWidth;
                                this.canvasElement.height = this.videoElement.videoHeight;
                                console.log(`ビデオサイズ: ${this.canvasElement.width}x${this.canvasElement.height}`);
                                this.updateStatus('スキャン中...', 'scanning');
                                resolve();
                            })
                            .catch(error => {
                                console.error("ビデオ再生エラー:", error);
                                this.canvasElement.width = 640;
                                this.canvasElement.height = 480;
                                this.updateStatus('スキャン準備完了', 'scanning');
                                resolve();
                            });
                    };
                    
                    this.videoElement.onerror = (event) => {
                        clearTimeout(timeoutId);
                        console.error("ビデオ要素でエラーが発生:", event);
                        reject(new Error('ビデオの読み込みに失敗しました'));
                    };
                });
            } else {
                throw new Error('ビデオ要素が見つかりません');
            }
        } catch (error) {
            console.error("カメラ起動エラー:", error);
            
            // より明確なエラーメッセージ
            if (error.name === 'NotAllowedError') {
                this.updateStatus('カメラへのアクセスが拒否されました', 'error');
            } else if (error.name === 'NotFoundError') {
                this.updateStatus('カメラが見つかりません', 'error');
            } else if (error.name === 'NotReadableError') {
                this.updateStatus('カメラが他のアプリで使用中', 'error');
                this.showReloadAdvice();
            } else {
                this.updateStatus('カメラをチェック中...', 'processing');
                // 1秒後に改めて試行
                setTimeout(() => {
                    this.retryCamera();
                }, 1000);
            }
            
            throw error;
        }
    },

    // カメラ接続リトライ
    retryCamera() {
        console.log('カメラ接続をリトライします');
        this.updateStatus('カメラに再接続しています...', 'processing');
        
        // 最小限の設定でリトライ
        navigator.mediaDevices.getUserMedia({ video: true })
            .then(stream => {
                console.log('リトライでカメラ接続成功');
                
                // 既存のストリームをクリア
                this.stopCamera();
                
                // 新しいストリームをセット
                this.videoStream = stream;
                this.videoElement.srcObject = stream;
                
                // グローバル変数に追加
                if (!window.activeMediaStreams) {
                    window.activeMediaStreams = [];
                }
                window.activeMediaStreams.push(stream);
                
                // ビデオ再生
                this.videoElement.play()
                    .then(() => {
                        console.log('リトライでビデオ再生成功');
                        this.canvasElement.width = this.videoElement.videoWidth || 640;
                        this.canvasElement.height = this.videoElement.videoHeight || 480;
                        this.updateStatus('スキャン中...', 'scanning');
                    })
                    .catch(playError => {
                        console.error('リトライでのビデオ再生エラー:', playError);
                        this.updateStatus('カメラは接続されましたがビデオの表示に問題があります', 'warning');
                    });
            })
            .catch(retryError => {
                console.error('カメラリトライエラー:', retryError);
                this.updateStatus('カメラに接続できません。ブラウザの設定を確認してください', 'error');
                this.showReloadAdvice();
            });
    },

    // 再読み込みを促すメッセージ表示
    showReloadAdvice() {
        // 検出状態の下に再読み込みボタンを追加
        const statusElement = document.getElementById('detection-status');
        if (statusElement && !document.getElementById('reload-advice')) {
            const reloadAdvice = document.createElement('div');
            reloadAdvice.id = 'reload-advice';
            reloadAdvice.innerHTML = `
                <div class="reload-message">カメラリソースがロックされています。</div>
                <button class="reload-button">ページを再読み込み</button>
            `;
            reloadAdvice.style.marginTop = '10px';
            reloadAdvice.style.textAlign = 'center';
            
            // ボタンスタイル
            const reloadButtonStyle = document.createElement('style');
            reloadButtonStyle.textContent = `
                .reload-message {
                    color: #ff6b6b;
                    margin-bottom: 8px;
                    font-size: 14px;
                }
                .reload-button {
                    background-color: #4a6cf7;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                }
                .reload-button:hover {
                    background-color: #3a5ce5;
                }
            `;
            document.head.appendChild(reloadButtonStyle);
            
            statusElement.parentNode.insertBefore(reloadAdvice, statusElement.nextSibling);
            
            // 再読み込みボタンのイベント
            document.querySelector('.reload-button').addEventListener('click', () => {
                window.location.reload();
            });
        }
    },

    // カメラ停止の改善
    stopCamera() {
        if (this.videoStream) {
            console.log('カメラストリームを停止します');
            this.videoStream.getTracks().forEach(track => {
                track.stop();
                console.log('トラック停止:', track.kind);
            });
            
            // グローバル変数からも削除
            if (window.activeMediaStreams) {
                window.activeMediaStreams = window.activeMediaStreams.filter(
                    stream => stream !== this.videoStream
                );
            }
            
            this.videoElement.srcObject = null;
            this.videoStream = null;
        }
    },
       
    // ビデオフレームをスキャン
    async scanVideoFrame() {
        // 処理中なら終了
        if (this.isProcessing) {
            return;
        }

        // 最後の検出から100ms以内なら処理をスキップ
        const currentTime = Date.now();
        if (currentTime - this.lastProcessingTime < 50) {
            return;
        }

        if (!this.isScanning || !this.videoElement || this.videoElement.readyState !== this.videoElement.HAVE_ENOUGH_DATA) {
            return;
        }

        this.isProcessing = true;
        this.lastProcessingTime = currentTime;

        try {
            // 一時的なフラグ
            let detected = false;

            // キャンバスにビデオフレームを描画
            this.canvasElement.width = this.videoElement.videoWidth;
            this.canvasElement.height = this.videoElement.videoHeight;
            this.canvasContext.drawImage(this.videoElement, 0, 0, this.canvasElement.width, this.canvasElement.height);
            
            // キャンバスデータを取得
            const imageData = this.canvasContext.getImageData(0, 0, this.canvasElement.width, this.canvasElement.height);
            
            // まずjsQRで試みる（高速）
            const jsQRResult = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "dontInvert"
            });
            
            if (jsQRResult) {
                // jsQRでコードが検出された場合
                console.log("jsQRでQRコードを検出:", jsQRResult.data);
                // 重複チェック
                if (!this.isDetectedCode(jsQRResult.data)) {
                    this.addDetectedCode(jsQRResult.data);
                    detected = true;
                    // 検出音を再生
                    this.playBeepSound();
                    // 結果UIを更新
                    this.updateResultsUI();
                } else {
                    console.log("重複コード検出（jsQR）", jsQRResult.data);
                    // 重複でも最後の検出時間は更新
                    this.lastDetection = Date.now();
                }
            }
            
            // jsQRで検出できなかった場合、ZXingを使用
            if (!detected && this.reader) {
                try {
                    // パフォーマンス改善: imageDataを直接使用
                    const result = await this.decodeWithZXing(imageData);
                    
                    if (result && result.length > 0) {
                        console.log("ZXingでQRコードを検出:", result[0].text);
                        if (!this.isDetectedCode(result[0].text)) {
                            this.addDetectedCode(result[0].text);
                            // 検出音を再生
                            this.playBeepSound();
                            // 結果UIを更新
                            this.updateResultsUI();
                        } else {
                            console.log("重複コード検出（ZXing）", result[0].text);
                            // 重複でも最後の検出時間は更新
                            this.lastDetection = Date.now();
                        }
                    }
                } catch (error) {
                    // ZXingエラーは静かに処理（jsQRが既に試行済み）
                    console.debug("ZXing検出エラー:", error.message);
                }
            }
        } catch (error) {
            console.error("スキャン処理中にエラーが発生しました:", error);
        } finally {
            this.isProcessing = false;
        }
    },

    // ZXingを使用してデコード（最適化版）
    async decodeWithZXing(imageData) {
        if (!this.reader) {
            throw new Error("ZXingリーダーが初期化されていません");
        }
        
        try {
            // ZXing直接デコード（最適化版）
            if (typeof this.reader.decodeFromImageData === 'function') {
                return this.reader.decodeFromImageData(imageData);
            } else {
                // 従来のデコード方法
                const dataUrl = this.imageDataToDataURL(imageData);
                const img = new Image();
                
                return new Promise((resolve, reject) => {
                    img.onload = () => {
                        try {
                            // 読み取り実行
                            if (typeof this.reader.decodeFromImage === 'function') {
                                const result = this.reader.decodeFromImage(img);
                                resolve(result);
                            } else if (typeof this.reader.decode === 'function') {
                                const result = this.reader.decode(img);
                                resolve([{ text: result.text, format: result.format }]);
                            } else {
                                reject(new Error("互換性のあるZXingデコード方法がありません"));
                            }
                        } catch (e) {
                            reject(e);
                        }
                    };
                    img.onerror = () => reject(new Error("画像読み込みエラー"));
                    img.src = dataUrl;
                });
            }
        } catch (e) {
            throw e;
        }
    },
    
    // ImageDataをDataURLに変換
    imageDataToDataURL(imageData) {
        const canvas = document.createElement('canvas');
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        const ctx = canvas.getContext('2d');
        ctx.putImageData(imageData, 0, 0);
        return canvas.toDataURL('image/png');
    },

    // 画像処理メソッド
    processImage: function(imageData) {
        const processedData = new ImageData(
            new Uint8ClampedArray(imageData.data),
            imageData.width,
            imageData.height
        );

        // コントラストと明るさの調整
        const contrast = 1.5;  // より高いコントラストで検出しやすく
        const brightness = 0.15; // 明るさを増加

        for (let i = 0; i < processedData.data.length; i += 4) {
            processedData.data[i] = Math.min(255, Math.max(0, (processedData.data[i] - 128) * contrast + 128 + brightness * 255));
            processedData.data[i + 1] = Math.min(255, Math.max(0, (processedData.data[i + 1] - 128) * contrast + 128 + brightness * 255));
            processedData.data[i + 2] = Math.min(255, Math.max(0, (processedData.data[i + 2] - 128) * contrast + 128 + brightness * 255));
        }

        // エッジ強調処理は軽量に
        if (this.imageProcessing.edgeEnhancement) {
            this.enhanceEdges(processedData);
        }

        return processedData;
    },

    // エッジ強調メソッド
    enhanceEdges: function(imageData) {
        const tempData = new Uint8ClampedArray(imageData.data);
        const width = imageData.width;
        const height = imageData.height;

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                let r = 0, g = 0, b = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const idx = ((y + ky) * width + (x + kx)) * 4;
                        const k = (ky === 0 && kx === 0) ? 9 : -1;
                        r += tempData[idx] * k;
                        g += tempData[idx + 1] * k;
                        b += tempData[idx + 2] * k;
                    }
                }
                const idx = (y * width + x) * 4;
                imageData.data[idx] = Math.min(255, Math.max(0, r));
                imageData.data[idx + 1] = Math.min(255, Math.max(0, g));
                imageData.data[idx + 2] = Math.min(255, Math.max(0, b));
            }
        }
    },

    // スキャン領域の初期化
    initializeScanAreas: function() {
        if (!this.canvasElement) {
            console.error('キャンバス要素が見つかりません');
            return;
        }

        const width = this.canvasElement.width;
        const height = this.canvasElement.height;
        
        // 中心領域を優先的にスキャン
        this.scanAreas = [
            // 中央の大きな領域
            {
                x: width * 0.25,
                y: height * 0.25,
                width: width * 0.5,
                height: height * 0.5
            },
            // 画面全体
            {
                x: 0,
                y: 0,
                width: width,
                height: height
            }
        ];
        
        // 3x3のグリッドを追加
        const gridSize = 3;
        for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
                this.scanAreas.push({
                    x: x * (width / gridSize),
                    y: y * (height / gridSize),
                    width: width / gridSize,
                    height: height / gridSize
                });
            }
        }

        console.log('スキャン領域を初期化しました:', this.scanAreas);
    },

    // 検出結果をマージし、信頼度に基づいてフィルタリング
    mergeResults(results) {
        console.log(`mergeResults: ${results.length}個の候補を処理`);
        // 結果が重複しないように確保
        const uniqueData = new Map();
        
        // 各結果を処理
        results.forEach((result, index) => {
            if (!result || !result.data) return;
            
            // 信頼度の計算（ここでは単純化）
            let confidence = 0.8; // デフォルト信頼度
            if (result.location) {
                // 位置情報の精度に基づく信頼度調整
                const { width, height } = result.location;
                // サイズが非常に小さい場合は信頼度を下げる
                if (width < 10 || height < 10) {
                    confidence *= 0.5;
                }
            }
            
            console.log(`候補 #${index+1}: "${result.data}" (信頼度: ${confidence.toFixed(2)})`);
            
            // 信頼度が閾値を超えているか確認
            const confidenceThreshold = 0.3; // 信頼度閾値を下げる
            if (confidence >= confidenceThreshold) {
                if (!uniqueData.has(result.data) || 
                    confidence > uniqueData.get(result.data).confidence) {
                    // 新しいデータまたはより高い信頼度の結果を保存
                    uniqueData.set(result.data, {
                        ...result,
                        confidence
                    });
                    console.log(`追加決定: "${result.data}" - 信頼度十分 (${confidence.toFixed(2)} >= ${confidenceThreshold})`);
                }
            } else {
                console.log(`除外: "${result.data}" - 信頼度不足 (${confidence.toFixed(2)} < ${confidenceThreshold})`);
            }
        });
        
        // 信頼度でソート（高い順）
        return Array.from(uniqueData.values()).sort((a, b) => b.confidence - a.confidence);
    },

    // 検出結果の信頼度を計算
    calculateConfidence: function(result) {
        if (!result || !result.location) {
            return 0;
        }

        let confidence = 0.5;
        
        if (this.frameHistory && this.frameHistory.length > 0) {
            const lastResult = this.frameHistory[this.frameHistory.length - 1];
            if (lastResult && lastResult.location) {
                const positionDiff = Math.abs(result.location.top - lastResult.location.top) +
                                   Math.abs(result.location.left - lastResult.location.left);
                confidence -= positionDiff / 1000;
            }
        }

        if (this.frameHistory) {
            const consistentCount = this.frameHistory.filter(r => r && r.data === result.data).length;
            confidence += consistentCount * 0.1;
        }

        return Math.min(1, Math.max(0, confidence));
    },

    // 検出ステータスを更新
    updateStatus(message, statusType = 'info') {
        if (!this.statusElement) {
            this.statusElement = document.getElementById('detection-status');
        }
        
        if (this.statusElement) {
            // 前の状態クラスをすべて削除
            this.statusElement.classList.remove('scanning', 'success', 'warning', 'error', 'processing', 'stopped');
            
            // 現在の状態クラスを追加
            if (statusType) {
                this.statusElement.classList.add(statusType);
            }
            
            // メッセージを設定
            this.statusElement.textContent = message;
        }
    },
    
    // 検出音を再生
    playBeepSound() {
        try {
            // サウンドエフェクトのAudio要素がなければ作成
            if (!this.beepSound) {
                this.beepSound = new Audio();
                // Base64でエンコードされた短いビープ音
                this.beepSound.src = 'data:audio/mp3;base64,SUQzAwAAAAAAJlRQRTEAAAAcAAAAU291bmRKYXkuY29tIFNvdW5kIEVmZmVjdHMA//uSwAAAAAABLBQAAAL6QWtva3MDAAAA/1RSSE8AAABHAAAATWF1c8OtIHlvdXJzZWxmAAAARVhUAAAAGgAAAFNvdW5kSmF5LmNvbSBTb3VuZCBFZmZlY3Rz//tQxAADsn0+Z80EABPEQKF7BgAHAAADTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVX/+1LEAQP3+nFj2CAAErSqnTnHgAHVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';
                this.beepSound.volume = 0.5;
            }
            
            // 音を再生
            this.beepSound.currentTime = 0;
            this.beepSound.play().catch(error => {
                console.warn('ビープ音の再生に失敗:', error);
            });
        } catch (error) {
            console.warn('ビープ音の初期化に失敗:', error);
        }
    },
    
    // 検出結果のUIを更新
    updateResultsUI() {
        console.log('結果UI更新を開始');
        if (!this.resultsList) {
            this.resultsList = document.getElementById('detected-codes-list');
            if (!this.resultsList) {
                console.error('検出結果リスト要素が見つかりません');
                return;
            }
        }
        
        console.log(`検出されたQRコード: ${this.detectedCodes.length}件`);
        // リストをクリア
        this.resultsList.innerHTML = '';
        
        // 検出されたQRコードがない場合
        if (this.detectedCodes.length === 0) {
            const emptyMessage = document.createElement('p');
            emptyMessage.className = 'empty-message';
            emptyMessage.textContent = 'QRコードが検出されていません';
            this.resultsList.appendChild(emptyMessage);
            console.log('検出結果なし - 空メッセージを表示');
            return;
        }
        
        // 検出されたQRコードをリスト表示
        this.detectedCodes.forEach((code, index) => {
            console.log(`表示: QRコード${index + 1} - ${code.data}`);
            const listItem = document.createElement('div');
            listItem.className = 'detected-code-item';
            
            // データ表示用の要素
            const dataElement = document.createElement('div');
            dataElement.className = 'code-data';
            dataElement.textContent = code.data;
            
            // 検出時刻の表示
            const timestamp = code.timestamp ? new Date(code.timestamp) : new Date();
            const timeElement = document.createElement('div');
            timeElement.className = 'code-time';
            timeElement.textContent = timestamp.toLocaleTimeString();
            
            // 削除ボタン
            const deleteButton = document.createElement('button');
            deleteButton.className = 'code-delete';
            deleteButton.textContent = '✕';
            deleteButton.dataset.index = index;
            deleteButton.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.index);
                this.detectedCodes.splice(idx, 1);
                this.updateResultsUI();
            });
            
            // 要素の組み立て
            listItem.appendChild(dataElement);
            listItem.appendChild(timeElement);
            listItem.appendChild(deleteButton);
            this.resultsList.appendChild(listItem);
        });
        console.log('結果UI更新完了');
    },
    
    // フレーム履歴を更新
    updateHistory: function(result) {
        if (!result || !result.data) {
            return;
        }

        if (!this.frameHistory) {
            this.frameHistory = [];
        }

        this.frameHistory.push(result);
        if (this.frameHistory.length > 5) {
            this.frameHistory.shift();
        }
    },

    // カメラ設定の動的調整
    adjustCameraSettings: async function() {
        if (!this.videoElement || !this.videoElement.srcObject) {
            console.error('ビデオ要素またはストリームが見つかりません');
            return;
        }

        try {
            const track = this.videoElement.srcObject.getVideoTracks()[0];
            if (!track) {
                console.error('ビデオトラックが見つかりません');
                return;
            }

            const capabilities = track.getCapabilities();
            const settings = track.getSettings();

            // フォーカスモードの設定
            if (capabilities.focusMode) {
                await track.applyConstraints({
                    advanced: [{ focusMode: 'continuous' }]
                });
            }

            // 露出設定の調整
            if (capabilities.exposureMode) {
                await track.applyConstraints({
                    advanced: [{ exposureMode: 'continuous' }]
                });
            }

            // 解像度の動的調整
            if (capabilities.width && capabilities.height) {
                const targetWidth = Math.min(1920, capabilities.width.max);
                const targetHeight = Math.min(1080, capabilities.height.max);
                
                await track.applyConstraints({
                    width: targetWidth,
                    height: targetHeight
                });
            }

            console.log('カメラ設定を最適化しました:', {
                width: settings.width,
                height: settings.height,
                frameRate: settings.frameRate
            });
        } catch (error) {
            console.warn('カメラ設定の調整に失敗:', error);
        }
    },

    // 画像処理設定の読み込み
    loadImageProcessingSettings() {
        try {
            const savedSettings = localStorage.getItem('imageProcessingSettings');
            if (savedSettings) {
                const settings = JSON.parse(savedSettings);
                this.imageProcessing = {
                    ...this.imageProcessing,
                    ...settings
                };
                console.log('画像処理設定を読み込みました:', this.imageProcessing);
            }
        } catch (error) {
            console.warn('画像処理設定の読み込みに失敗:', error);
        }
    },

    // 複数スキャンビューの表示
    showMultiScanView() {
        console.log('複数スキャンビューを表示します');
        
        // コンテナ要素の確認
        const container = document.getElementById('multi-qr-container');
        if (!container) {
            console.error('multi-qr-container要素が見つかりません');
            return;
        }
        
        // コンテナを表示
        container.style.display = 'block';
        console.log('multi-qr-containerの表示スタイル:', container.style.display);
        
        // ビデオ要素の確認
        this.videoElement = document.getElementById('multi-qr-video');
        if (!this.videoElement) {
            console.error('multi-qr-video要素が見つかりません');
            return;
        }
        
        // キャンバス要素の確認と初期化
        this.canvasElement = document.createElement('canvas');
        this.canvasContext = this.canvasElement.getContext('2d', { willReadFrequently: true });
        
        // スキャン領域の初期化
        this.initializeScanAreas();
        
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
        
        // 検出済みQRコードの配列を初期化
        this.detectedCodes = [];
        this.updateResultsUI();
        
        // カメラの起動
        this.startCamera()
            .then(() => {
                console.log('カメラの起動に成功しました');
                this.isScanning = true;
                this.scanInterval = setInterval(() => this.scanVideoFrame(), 80);
            })
            .catch(error => {
                console.error('カメラの起動に失敗しました:', error);
                this.updateStatus('カメラの起動に失敗しました', 'error');
            });
    },

    // 検出済みQRコードかどうかをチェック（新規追加）
    isDetectedCode(data) {
        if (!data) return false;
        return this.detectedCodes.some(code => code.data === data);
    },
    
    // 検出されたQRコードを追加（新規追加）
    addDetectedCode(data) {
        if (!data) return;
        
        // 現在の時刻を取得
        const timestamp = Date.now();
        
        // 検出結果を追加
        this.detectedCodes.push({
            data: data,
            timestamp: timestamp
        });
        
        // 最後の検出時刻を更新
        this.lastDetection = timestamp;
        
        console.log(`新しいQRコードを追加: ${data}`);
        
        // 検出ステータスを更新
        this.updateStatus(`QRコードを検出: ${this.detectedCodes.length}個`, 'success');
    }
}