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
                        // 高速化のためのヒント追加
                        if (ZXing.DecodeHintType.CHARACTER_SET) {
                            hintsMap.set(ZXing.DecodeHintType.CHARACTER_SET, "UTF-8");
                        }
                        this.reader = new ZXing.BrowserMultiFormatReader(hintsMap);
                    } else {
                        // 新しいバージョン
                        hints.formats = ['QR_CODE'];
                        hints.tryHarder = true;
                        hints.characterSet = "UTF-8";
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
            
            // 最適化されたカメラ設定
            const optimizedConstraints = {
                video: {
                    facingMode: 'environment', // 背面カメラを使用
                    width: { ideal: 1280 },    // 幅の理想値
                    height: { ideal: 720 },    // 高さの理想値
                    aspectRatio: { ideal: 4/3 }, // アスペクト比
                    frameRate: { ideal: 15, min: 10 } // フレームレート
                }
            };
            
            // 高度なカメラ設定をサポートしているか確認
            let advancedConstraintsSupported = false;
            try {
                // テスト用の簡易制約で確認
                const supportedConstraints = navigator.mediaDevices.getSupportedConstraints();
                advancedConstraintsSupported = supportedConstraints.focusMode && 
                                            supportedConstraints.exposureMode;
                console.log('サポートされている制約:', supportedConstraints);
            } catch (e) {
                console.log('高度なカメラ制約はサポートされていません');
            }
            
            // 高度な設定がサポートされている場合のみ追加
            if (advancedConstraintsSupported) {
                optimizedConstraints.video.advanced = [
                    { focusMode: 'continuous' },      // 連続的な自動フォーカス
                    { exposureMode: 'continuous' },   // 自動露出
                    { whiteBalanceMode: 'continuous' } // 自動ホワイトバランス
                ];
            }
            
            // 解像度レベルリスト (最適解から徐々に低下)
            const resolutionLevels = [
                optimizedConstraints, // 最適な設定を最初に試行
                // レベル2: 中解像度
                { 
                    video: { 
                        facingMode: 'environment',
                        width: { ideal: 800 },
                        height: { ideal: 600 }
                    } 
                },
                // レベル3: 低解像度
                { 
                    video: { 
                        facingMode: 'environment',
                        width: { ideal: 640 },
                        height: { ideal: 480 }
                    } 
                },
                // レベル4: 最低限の設定
                { 
                    video: true
                }
            ];
            
            // グローバルにすべてのメディアストリームを停止
            if (typeof window.releaseAllCameras === 'function') {
                await window.releaseAllCameras();
                console.log('すべてのカメラリソースを解放しました');
            } else {
                // 従来の方法でカメラを停止
                this.stopCamera();
                console.log('このコンポーネントのカメラを停止しました');
                
                // 他のビデオ要素のストリームも停止（安全策）
                document.querySelectorAll('video').forEach(video => {
                    if (video !== this.videoElement && video.srcObject) {
                        const stream = video.srcObject;
                        if (stream.getTracks) {
                            stream.getTracks().forEach(track => {
                                track.stop();
                                console.log('他のビデオ要素のトラックを停止:', track.kind);
                            });
                        }
                        video.srcObject = null;
                    }
                });
                
                // しばらく待機
                await new Promise(resolve => setTimeout(resolve, 1000));
                console.log('カメラリソース解放のため1秒待機しました');
            }
            
            // この時点でカメラリソースは解放されているはず
            
            // 重要: enumerateDevices を呼び出してカメラをリフレッシュ
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            console.log('利用可能なカメラ:', videoDevices.length);
            
            if (videoDevices.length === 0) {
                throw new Error('カメラデバイスが見つかりません');
            }
            
            // 各解像度レベルを順番に試行
            let stream = null;
            let lastError = null;
            
            for (let i = 0; i < resolutionLevels.length; i++) {
                const constraints = resolutionLevels[i];
                console.log(`カメラ解像度レベル${i+1}を試行:`, constraints);
                
                try {
                    // getUserMediaの呼び出し前に再度確認
                    if (i > 0) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                        console.log(`レベル${i+1}試行前に500ms待機`);
                    }
                    
                    stream = await navigator.mediaDevices.getUserMedia(constraints);
                    console.log(`カメラ解像度レベル${i+1}で成功しました`);
                    
                    // カメラが起動したらストリームの状態を確認
                    console.log('カメラストリーム情報:', stream.getVideoTracks()[0].getSettings());
                    
                    break; // 成功したらループを抜ける
                } catch (error) {
                    lastError = error;
                    console.warn(`カメラ解像度レベル${i+1}で失敗:`, error.name);
                    
                    // ブラウザによっては特定のエラーが発生後すぐに再試行すると同じエラーが続くことがあるため待機
                    if (i < resolutionLevels.length - 1) {
                        console.log('次の解像度レベルを試行します...');
                    }
                }
            }
            
            // すべての解像度レベルで失敗した場合
            if (!stream) {
                throw lastError || new Error('すべての解像度設定でカメラの起動に失敗しました');
            }
            
            // グローバル変数に追加して管理
            if (!window.activeMediaStreams) {
                window.activeMediaStreams = [];
            }
            window.activeMediaStreams.push(stream);
            
            // ストリームをセット
            this.videoStream = stream;
            
            // ビデオ要素に設定する前にもう一度クリア
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
                    this.updateStatus('カメラ接続に時間がかかっています', 'warning');
                    resolve();
                }, 5000);
                
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
                            this.updateStatus('ビデオ再生エラー', 'error');
                            // エラーが発生しても続行を試みる
                            this.canvasElement.width = 640;
                            this.canvasElement.height = 480;
                            resolve();
                        });
                };
                
                this.videoElement.onerror = (event) => {
                    clearTimeout(timeoutId);
                    console.error("ビデオ要素でエラーが発生:", event);
                    this.updateStatus('ビデオ読み込みエラー', 'error');
                    reject(new Error('ビデオの読み込みに失敗しました'));
                };
            });
        } catch (error) {
            console.error("カメラ起動エラー:", error);
            
            // より明確なエラーメッセージ
            if (error.name === 'NotAllowedError') {
                this.updateStatus('カメラへのアクセスが拒否されました', 'error');
            } else if (error.name === 'NotFoundError') {
                this.updateStatus('カメラが見つかりません', 'error');
            } else if (error.name === 'NotReadableError') {
                this.updateStatus('カメラが他のアプリで使用中', 'error');
                
                // 特にNotReadableErrorの場合、ブラウザを再読み込みするようアドバイス
                this.showReloadAdvice();
            } else if (error.name === 'OverconstrainedError') {
                this.updateStatus('要求した解像度はサポートされていません', 'error');
            } else {
                this.updateStatus('カメラアクセスエラー: ' + error.name, 'error');
            }
            
            throw error;
        }
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
        if (!this.isScanning || this.videoElement.readyState !== this.videoElement.HAVE_ENOUGH_DATA) {
            return;
        }

        try {
            // 現在時刻を取得
            const now = Date.now();
            
            // 前回の検出から300ms以内なら処理をスキップ
            if (now - this.lastDetection < 300) {
                return;
            }

            // ビデオフレームをキャンバスに描画
            this.canvasContext.drawImage(
                this.videoElement, 
                0, 0, 
                this.canvasElement.width, 
                this.canvasElement.height
            );
            
            // 画像処理の開始
            const startTime = performance.now();
            
            // 画像データを取得
            const imageData = this.canvasContext.getImageData(
                0, 0, 
                this.canvasElement.width, 
                this.canvasElement.height
            );

            // 画像処理を適用
            const processedImageData = this.processImage(imageData);
            
            // 処理後の画像をキャンバスに戻す
            this.canvasContext.putImageData(processedImageData, 0, 0);
            
            // 処理時間を計測
            const processingTime = performance.now() - startTime;
            console.log(`画像処理時間: ${processingTime.toFixed(2)}ms`);

            let detected = false;
            const allResults = [];

            // スキャン領域ごとに処理
            if (!this.scanAreas) {
                this.initializeScanAreas();
            }

            for (const area of this.scanAreas) {
                const areaImageData = this.canvasContext.getImageData(
                    area.x, area.y, area.width, area.height
                );

                // ZXingライブラリでの検出を試みる（高速）
                if (this.reader && typeof this.reader.decodeFromImage === 'function') {
                    try {
                        // データURLに変換
                        const dataURL = this.canvasElement.toDataURL('image/jpeg', 0.8);
                        
                        // 画像要素を作成
                        const img = document.createElement('img');
                        img.src = dataURL;
                        
                        // 画像の読み込みを待つ
                        await new Promise((resolve) => {
                            img.onload = resolve;
                        });
                        
                        // ZXingで検出
                        const result = await this.reader.decodeFromImage(img);
                        if (result) {
                            const codeData = result.text || (typeof result.getText === 'function' ? result.getText() : String(result));
                            console.log('ZXingで検出:', codeData);
                            
                            allResults.push({
                                data: codeData,
                                location: {
                                    top: area.y,
                                    left: area.x,
                                    width: area.width,
                                    height: area.height
                                }
                            });
                            detected = true;
                        }
                    } catch (zxingError) {
                        console.warn('ZXingデコードエラー:', zxingError);
                    }
                }
                
                // jsQRでの検出（フォールバック）
                if (!detected && typeof jsQR === 'function') {
                    try {
                        const code = jsQR(
                            areaImageData.data,
                            areaImageData.width,
                            areaImageData.height,
                            {
                                inversionAttempts: "dontInvert"
                            }
                        );
                        
                        if (code) {
                            console.log('jsQRで検出:', code.data);
                            allResults.push({
                                data: code.data,
                                location: {
                                    top: area.y + code.location.topLeft.y,
                                    left: area.x + code.location.topLeft.x,
                                    width: code.location.bottomRight.x - code.location.topLeft.x,
                                    height: code.location.bottomRight.y - code.location.topLeft.y
                                }
                            });
                        }
                    } catch (jsQRError) {
                        console.warn('jsQRデコードエラー:', jsQRError);
                    }
                }
            }

            // 検出結果の統合と信頼度評価
            if (allResults.length > 0) {
                const mergedResults = this.mergeResults(allResults);
                
                // 新しいコードの検出
                mergedResults.forEach(result => {
                    const isDuplicate = this.detectedCodes.some(item => item.data === result.data);
                    if (!isDuplicate) {
                        this.detectedCodes.push({
                            id: Date.now() + Math.random().toString(36).substring(2, 9),
                            data: result.data,
                            format: 'QR_CODE',
                            timestamp: new Date().toISOString()
                        });
                        
                        this.lastDetection = now;
                        this.playBeepSound();
                        this.updateResultsUI();
                        this.updateStatus(`${this.detectedCodes.length}個のQRコードを検出`, 'success');
                    }
                });
            }
        } catch (error) {
            console.error('スキャン処理エラー:', error);
        }
    },

    // 画像処理メソッド
    processImage: function(imageData) {
        const processedData = new ImageData(
            new Uint8ClampedArray(imageData.data),
            imageData.width,
            imageData.height
        );

        // コントラストと明るさの調整
        const contrast = 1.2;
        const brightness = 0.1;

        for (let i = 0; i < processedData.data.length; i += 4) {
            processedData.data[i] = Math.min(255, Math.max(0, (processedData.data[i] - 128) * contrast + 128 + brightness * 255));
            processedData.data[i + 1] = Math.min(255, Math.max(0, (processedData.data[i + 1] - 128) * contrast + 128 + brightness * 255));
            processedData.data[i + 2] = Math.min(255, Math.max(0, (processedData.data[i + 2] - 128) * contrast + 128 + brightness * 255));
        }

        // エッジ強調
        this.enhanceEdges(processedData);

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
        const gridSize = 3; // 3x3のグリッド

        this.scanAreas = [];
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

    // 検出結果を統合
    mergeResults: function(results) {
        if (!results || results.length === 0) {
            return [];
        }

        const mergedResults = new Map();
        const confidenceThreshold = 0.7;

        results.forEach(result => {
            if (!result || !result.data) {
                return;
            }

            const confidence = this.calculateConfidence(result);
            if (confidence >= confidenceThreshold) {
                if (!mergedResults.has(result.data) || 
                    mergedResults.get(result.data).confidence < confidence) {
                    mergedResults.set(result.data, {
                        data: result.data,
                        confidence: confidence,
                        location: result.location
                    });
                }
            }
        });

        return Array.from(mergedResults.values());
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
        try {
            const container = document.getElementById('multi-qr-container');
            if (!container) {
                console.error('multi-qr-containerが見つかりません');
                return;
            }

            // ビデオ要素の確認
            this.videoElement = document.getElementById('multi-qr-video');
            if (!this.videoElement) {
                console.error('multi-qr-video要素が見つかりません');
                return;
            }

            // キャンバス要素の確認
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

            console.log('複数スキャンビューを表示しました');
        } catch (error) {
            console.error('複数スキャンビューの表示に失敗:', error);
        }
    }
}