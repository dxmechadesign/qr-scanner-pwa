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
            this.scanInterval = setInterval(() => this.scanVideoFrame(), 150);
            
            // スキャン中表示
            this.updateStatus('スキャン中...', 'scanning');
            
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
            this.processImage(imageData);
            
            // 処理後の画像をキャンバスに戻す
            this.canvasContext.putImageData(imageData, 0, 0);
            
            // 処理時間を計測
            const processingTime = performance.now() - startTime;
            console.log(`画像処理時間: ${processingTime.toFixed(2)}ms`);
            
            let detected = false;
            
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
                        
                        // 重複チェック
                        const isDuplicate = this.detectedCodes.some(item => item.data === codeData);
                        
                        if (!isDuplicate) {
                            this.detectedCodes.push({
                                id: Date.now() + Math.random().toString(36).substring(2, 9),
                                data: codeData,
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
                        detected = true;
                    }
                } catch (zxingError) {
                    // ZXingでエラーが発生した場合はjsQRにフォールバック
                    // console.warn('ZXingデコードエラー:', zxingError);
                }
            }
            
            // ZXingで検出できなかった場合はjsQRを使用
            if (!detected && typeof jsQR === 'function') {
                try {
                    // キャンバスからイメージデータを取得
                    const imageData = this.canvasContext.getImageData(
                        0, 0, 
                        this.canvasElement.width, 
                        this.canvasElement.height
                    );
                    
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
    },

    // グレースケール変換
    toGrayscale(imageData) {
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            // 輝度の重み付け平均（人間の視覚に適した変換）
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            data[i] = data[i + 1] = data[i + 2] = gray;
        }
        return imageData;
    },
    
    // コントラスト調整
    adjustContrast(imageData, factor) {
        const data = imageData.data;
        const factor255 = 255 * (factor - 1);
        
        for (let i = 0; i < data.length; i += 4) {
            for (let j = 0; j < 3; j++) {
                const val = data[i + j];
                data[i + j] = Math.min(255, Math.max(0, factor * (val - 128) + 128));
            }
        }
        return imageData;
    },
    
    // シャープニング処理
    sharpen(imageData) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        const tempData = new Uint8ClampedArray(data);
        
        // エッジ強調用カーネル
        const kernel = [
            0, -1, 0,
            -1, 5, -1,
            0, -1, 0
        ];
        
        // 画像の端を除いて処理
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                for (let c = 0; c < 3; c++) {
                    let sum = 0;
                    
                    for (let ky = -1; ky <= 1; ky++) {
                        for (let kx = -1; kx <= 1; kx++) {
                            const idx = ((y + ky) * width + (x + kx)) * 4 + c;
                            sum += tempData[idx] * kernel[(ky + 1) * 3 + kx + 1];
                        }
                    }
                    
                    const idx = (y * width + x) * 4 + c;
                    data[idx] = Math.min(255, Math.max(0, sum));
                }
            }
        }
        
        return imageData;
    },
    
    // 適応的二値化処理（局所的な閾値を使用）
    adaptiveThreshold(imageData, regionSize = 15, constant = 5) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        const grayscaleCopy = new Uint8Array(width * height);
        
        // グレースケール配列を作成
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                grayscaleCopy[y * width + x] = data[idx];
            }
        }
        
        // 各ピクセルに対して局所的な閾値を計算して二値化
        const halfRegion = Math.floor(regionSize / 2);
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let sum = 0;
                let count = 0;
                
                // 周辺領域の平均を計算（最適化のため、サンプリング間隔を設定）
                const step = Math.max(1, Math.floor(regionSize / 5));
                
                for (let dy = -halfRegion; dy <= halfRegion; dy += step) {
                    for (let dx = -halfRegion; dx <= halfRegion; dx += step) {
                        const nx = x + dx;
                        const ny = y + dy;
                        
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            sum += grayscaleCopy[ny * width + nx];
                            count++;
                        }
                    }
                }
                
                // 局所平均を閾値に使用
                const threshold = Math.floor(sum / count) - constant;
                const idx = (y * width + x) * 4;
                const value = grayscaleCopy[y * width + x] < threshold ? 0 : 255;
                
                data[idx] = data[idx + 1] = data[idx + 2] = value;
            }
        }
        
        return imageData;
    },
    
    // すべての画像処理を適用するメイン関数
    processImage(imageData) {
        if (!this.imageProcessing.enabled) return imageData;
        
        // グレースケール変換は常に適用
        this.toGrayscale(imageData);
        
        // コントラスト調整
        if (this.imageProcessing.contrastFactor !== 1.0) {
            this.adjustContrast(imageData, this.imageProcessing.contrastFactor);
        }
        
        // シャープニング
        if (this.imageProcessing.sharpeningEnabled) {
            this.sharpen(imageData);
        }
        
        // 適応的二値化
        if (this.imageProcessing.thresholdEnabled) {
            this.adaptiveThreshold(
                imageData, 
                this.imageProcessing.regionSize, 
                this.imageProcessing.thresholdConstant
            );
        }
        
        return imageData;
    },

    // 設定の保存
    saveProcessingSettings() {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('qr-image-processing', JSON.stringify(this.imageProcessing));
        }
    },
    
    // 設定のロード
    loadProcessingSettings() {
        if (typeof localStorage !== 'undefined') {
            const settings = localStorage.getItem('qr-image-processing');
            if (settings) {
                try {
                    this.imageProcessing = {...this.imageProcessing, ...JSON.parse(settings)};
                } catch (error) {
                    console.error('画像処理設定の読み込みエラー:', error);
                }
            }
        }
    },
    
    // 設定イベントの設定
    setupProcessingSettings() {
        // 設定UIの要素を取得
        const enableProcessing = document.getElementById('enable-processing');
        const contrastFactor = document.getElementById('contrast-factor');
        const contrastValue = document.getElementById('contrast-value');
        const enableSharpen = document.getElementById('enable-sharpen');
        const enableThreshold = document.getElementById('enable-threshold');
        const resetButton = document.getElementById('reset-processing');
        
        if (!enableProcessing) return; // 設定UIがない場合は終了
        
        // 現在の設定を反映
        enableProcessing.checked = this.imageProcessing.enabled;
        contrastFactor.value = this.imageProcessing.contrastFactor;
        contrastValue.textContent = this.imageProcessing.contrastFactor;
        enableSharpen.checked = this.imageProcessing.sharpeningEnabled;
        enableThreshold.checked = this.imageProcessing.thresholdEnabled;
        
        // イベントリスナーの設定
        enableProcessing.addEventListener('change', (e) => {
            this.imageProcessing.enabled = e.target.checked;
            this.saveProcessingSettings();
        });
        
        contrastFactor.addEventListener('input', (e) => {
            this.imageProcessing.contrastFactor = parseFloat(e.target.value);
            contrastValue.textContent = e.target.value;
            this.saveProcessingSettings();
        });
        
        enableSharpen.addEventListener('change', (e) => {
            this.imageProcessing.sharpeningEnabled = e.target.checked;
            this.saveProcessingSettings();
        });
        
        enableThreshold.addEventListener('change', (e) => {
            this.imageProcessing.thresholdEnabled = e.target.checked;
            this.saveProcessingSettings();
        });
        
        resetButton.addEventListener('click', () => {
            // デフォルト設定に戻す
            this.imageProcessing = {
                enabled: true,
                contrastFactor: 1.4,
                sharpeningEnabled: true,
                thresholdEnabled: true,
                regionSize: 15,
                thresholdConstant: 5,
                debug: false
            };
            
            // UI更新
            enableProcessing.checked = true;
            contrastFactor.value = 1.4;
            contrastValue.textContent = "1.4";
            enableSharpen.checked = true;
            enableThreshold.checked = true;
            
            this.saveProcessingSettings();
        });
    },

    // グレースケール変換
    toGrayscale(imageData) {
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            // 輝度の重み付け平均
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            data[i] = data[i + 1] = data[i + 2] = gray;
        }
        return imageData;
    },
    
    // コントラスト調整
    adjustContrast(imageData, factor) {
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            for (let j = 0; j < 3; j++) {
                const val = data[i + j];
                // コントラスト調整式
                data[i + j] = Math.min(255, Math.max(0, factor * (val - 128) + 128));
            }
        }
        return imageData;
    },
    
    // シャープニング処理
    sharpen(imageData) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        const tempData = new Uint8ClampedArray(data);
        
        // エッジ強調用カーネル
        const kernel = [
            0, -1, 0,
            -1, 5, -1,
            0, -1, 0
        ];
        
        // 画像の端から1ピクセル内側のみ処理（エッジ処理を簡略化）
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const pixelIndex = (y * width + x) * 4;
                
                for (let c = 0; c < 3; c++) {
                    let sum = 0;
                    let kernelIndex = 0;
                    
                    for (let ky = -1; ky <= 1; ky++) {
                        for (let kx = -1; kx <= 1; kx++) {
                            const idx = ((y + ky) * width + (x + kx)) * 4 + c;
                            sum += tempData[idx] * kernel[kernelIndex++];
                        }
                    }
                    
                    data[pixelIndex + c] = Math.min(255, Math.max(0, sum));
                }
            }
        }
        
        return imageData;
    },
    
    // 適応的二値化（シンプル版 - パフォーマンス重視）
    adaptiveThreshold(imageData, regionSize = 15, constant = 5) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        
        // 処理を高速化するため、サブサンプリングして平均を計算
        const sampling = Math.max(1, Math.floor(regionSize / 3));
        const halfRegion = Math.floor(regionSize / 2);
        
        // サブサンプリングした領域の平均を使用して処理
        for (let y = 0; y < height; y += sampling) {
            for (let x = 0; x < width; x += sampling) {
                // 局所領域の平均を計算
                let sum = 0;
                let count = 0;
                
                // 周辺領域をサンプリング
                for (let dy = -halfRegion; dy <= halfRegion; dy += sampling) {
                    for (let dx = -halfRegion; dx <= halfRegion; dx += sampling) {
                        const nx = x + dx;
                        const ny = y + dy;
                        
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            sum += data[(ny * width + nx) * 4];
                            count++;
                        }
                    }
                }
                
                // 平均を計算し、閾値として使用
                const threshold = Math.floor(sum / count) - constant;
                
                // この領域内のピクセルを二値化
                for (let sy = 0; sy < sampling && y + sy < height; sy++) {
                    for (let sx = 0; sx < sampling && x + sx < width; sx++) {
                        const currentY = y + sy;
                        const currentX = x + sx;
                        const idx = (currentY * width + currentX) * 4;
                        
                        // 閾値処理
                        const value = data[idx] < threshold ? 0 : 255;
                        data[idx] = data[idx + 1] = data[idx + 2] = value;
                    }
                }
            }
        }
        
        return imageData;
    },
    
    // すべての画像処理を適用するメイン関数
    processImage(imageData) {
        if (!this.imageProcessing.enabled) return imageData;
        
        // オリジナルのデータをデバッグ用にコピー
        let originalImageData = null;
        if (this.imageProcessing.debug) {
            originalImageData = new ImageData(
                new Uint8ClampedArray(imageData.data), 
                imageData.width, 
                imageData.height
            );
        }
        
        // グレースケール変換
        if (this.imageProcessing.useGrayscale) {
            this.toGrayscale(imageData);
        }
        
        // コントラスト調整（係数が1.0より大きい場合のみ）
        if (this.imageProcessing.contrastFactor > 1.0) {
            this.adjustContrast(imageData, this.imageProcessing.contrastFactor);
        }
        
        // シャープニング
        if (this.imageProcessing.sharpeningEnabled) {
            this.sharpen(imageData);
        }
        
        // 適応的二値化
        if (this.imageProcessing.thresholdEnabled) {
            this.adaptiveThreshold(
                imageData, 
                this.imageProcessing.regionSize, 
                this.imageProcessing.thresholdConstant
            );
        }
        
        // デバッグ表示
        if (this.imageProcessing.debug && originalImageData) {
            this.showDebugImages(originalImageData, imageData);
        }
        
        return imageData;
    },
    
    // デバッグ表示用（オプション）
    showDebugImages(originalImageData, processedImageData) {
        // デバッグ用キャンバスの作成
        let debugContainer = document.getElementById('qr-debug-container');
        if (!debugContainer) {
            debugContainer = document.createElement('div');
            debugContainer.id = 'qr-debug-container';
            debugContainer.style.position = 'fixed';
            debugContainer.style.bottom = '10px';
            debugContainer.style.right = '10px';
            debugContainer.style.zIndex = '9999';
            debugContainer.style.display = 'flex';
            debugContainer.style.background = 'rgba(0,0,0,0.7)';
            debugContainer.style.padding = '5px';
            debugContainer.style.borderRadius = '5px';
            document.body.appendChild(debugContainer);
            
            const originalCanvas = document.createElement('canvas');
            originalCanvas.width = 160;
            originalCanvas.height = 120;
            originalCanvas.style.marginRight = '5px';
            
            const processedCanvas = document.createElement('canvas');
            processedCanvas.width = 160;
            processedCanvas.height = 120;
            
            debugContainer.appendChild(originalCanvas);
            debugContainer.appendChild(processedCanvas);
            
            this.debugCanvases = {
                original: originalCanvas.getContext('2d'),
                processed: processedCanvas.getContext('2d')
            };
        }
        
        // 縮小表示
        const origCtx = this.debugCanvases.original;
        const procCtx = this.debugCanvases.processed;
        
        // 元画像を描画
        origCtx.canvas.width = 160;
        origCtx.canvas.height = 120;
        origCtx.putImageData(originalImageData, 0, 0, 0, 0, 
            origCtx.canvas.width, origCtx.canvas.height);
        
        // 処理後画像を描画
        procCtx.canvas.width = 160;
        procCtx.canvas.height = 120;
        procCtx.putImageData(processedImageData, 0, 0, 0, 0, 
            procCtx.canvas.width, procCtx.canvas.height);
    },

    // 画像処理設定の保存
    saveImageProcessingSettings() {
        if (typeof localStorage !== 'undefined') {
            try {
                localStorage.setItem('qr-image-processing', JSON.stringify(this.imageProcessing));
                console.log('画像処理設定を保存しました');
            } catch (error) {
                console.error('設定の保存に失敗:', error);
            }
        }
    },
    
    // 画像処理設定の読み込み
    loadImageProcessingSettings() {
        if (typeof localStorage !== 'undefined') {
            try {
                const saved = localStorage.getItem('qr-image-processing');
                if (saved) {
                    const parsedSettings = JSON.parse(saved);
                    // 既存設定とマージ（新しい設定項目を保持）
                    this.imageProcessing = {...this.imageProcessing, ...parsedSettings};
                    console.log('画像処理設定を読み込みました:', this.imageProcessing);
                }
            } catch (error) {
                console.error('設定の読み込みに失敗:', error);
            }
        }
    },

    // 複数領域スキャン処理の追加
    async scanMultipleRegions() {
        if (!this.isScanning || this.videoElement.readyState !== this.videoElement.HAVE_ENOUGH_DATA) {
            return;
        }
        
        try {
            // 現在のフレームをキャンバスに描画
            this.canvasContext.drawImage(
                this.videoElement, 
                0, 0, 
                this.canvasElement.width, 
                this.canvasElement.height
            );
            
            // 画面を複数の領域に分割してスキャン
            const regions = [
                // 上部領域
                {
                    x: 0,
                    y: 0,
                    width: this.canvasElement.width,
                    height: this.canvasElement.height / 3
                },
                // 中央上部領域
                {
                    x: 0,
                    y: this.canvasElement.height / 4,
                    width: this.canvasElement.width,
                    height: this.canvasElement.height / 3
                },
                // 中央領域
                {
                    x: 0,
                    y: this.canvasElement.height / 3,
                    width: this.canvasElement.width,
                    height: this.canvasElement.height / 3
                },
                // 中央下部領域
                {
                    x: 0,
                    y: this.canvasElement.height / 2,
                    width: this.canvasElement.width,
                    height: this.canvasElement.height / 3
                },
                // 下部領域
                {
                    x: 0,
                    y: 2 * this.canvasElement.height / 3,
                    width: this.canvasElement.width,
                    height: this.canvasElement.height / 3
                }
            ];
            
            // 各領域を個別に処理
            for (const region of regions) {
                // 領域ごとに画像データを取得
                const imageData = this.canvasContext.getImageData(
                    region.x, region.y, region.width, region.height
                );
                
                // 画像処理を適用
                this.processImage(imageData);
                
                // 処理後の画像を使用してQRコードを検出（jsQRを使用）
                const code = jsQR(
                    imageData.data,
                    imageData.width,
                    imageData.height,
                    {
                        inversionAttempts: "dontInvert"
                    }
                );
                
                if (code) {
                    // 重複チェック
                    const isDuplicate = this.detectedCodes.some(item => item.data === code.data);
                    
                    if (!isDuplicate) {
                        this.detectedCodes.push({
                            id: Date.now() + Math.random().toString(36).substring(2, 9),
                            data: code.data,
                            format: 'QR_CODE',
                            timestamp: new Date().toISOString()
                        });
                        
                        this.lastDetection = Date.now();
                        this.playBeepSound();
                        this.updateResultsUI();
                        this.updateStatus(`${this.detectedCodes.length}個のQRコードを検出`, 'success');
                        
                        // 検出位置を視覚的に表示（デバッグモード）
                        if (this.imageProcessing.debug) {
                            this.highlightDetection(region.x + code.location.topLeftCorner.x, 
                                                region.y + code.location.topLeftCorner.y,
                                                code.location.dimension);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('複数領域スキャン処理エラー:', error);
        }
    },

    // エッジ強調処理
    enhanceEdges(imageData) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        const tempData = new Uint8ClampedArray(data);
        
        // Sobelフィルターによるエッジ検出
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                // 水平方向のエッジ検出フィルター
                const hKernel = [
                    -1, -2, -1,
                    0,  0,  0,
                    1,  2,  1
                ];
                
                // 垂直方向のエッジ検出フィルター
                const vKernel = [
                    -1, 0, 1,
                    -2, 0, 2,
                    -1, 0, 1
                ];
                
                let hSum = 0;
                let vSum = 0;
                
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const idx = ((y + ky) * width + (x + kx)) * 4;
                        const kernelIdx = (ky + 1) * 3 + (kx + 1);
                        
                        hSum += tempData[idx] * hKernel[kernelIdx];
                        vSum += tempData[idx] * vKernel[kernelIdx];
                    }
                }
                
                // エッジの強さ
                const edgeMagnitude = Math.sqrt(hSum * hSum + vSum * vSum);
                const pixelIndex = (y * width + x) * 4;
                
                // 閾値を超えたらエッジとして強調
                if (edgeMagnitude > 50) {
                    data[pixelIndex] = data[pixelIndex + 1] = data[pixelIndex + 2] = 0; // 黒
                } else {
                    // 輝度が高い部分は白く
                    if (tempData[pixelIndex] > 127) {
                        data[pixelIndex] = data[pixelIndex + 1] = data[pixelIndex + 2] = 255; // 白
                    }
                }
            }
        }
        
        return imageData;
    },

    // 適応的なスキャンインターバルの設定
    setAdaptiveScanInterval() {
        // 初期スキャン間隔
        let interval = 150; // ミリ秒
        
        // 最後の処理時間に基づいて調整
        if (this.lastProcessingTime) {
            if (this.lastProcessingTime > 100) {
                // 処理に時間がかかっている場合、間隔を長くする
                interval = Math.min(300, this.lastProcessingTime * 1.5);
            } else if (this.lastProcessingTime < 30) {
                // 処理が速い場合、間隔を短くする
                interval = Math.max(50, this.lastProcessingTime * 2);
            }
        }
        
        console.log(`スキャンインターバルを${interval}msに調整`);
        
        // 既存のインターバルをクリア
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
        }
        
        // 新しいインターバルを設定
        this.scanInterval = setInterval(() => {
            const startTime = performance.now();
            
            // 複数領域スキャンを実行
            this.scanMultipleRegions();
            
            // 処理時間を記録
            this.lastProcessingTime = performance.now() - startTime;
        }, interval);
    },

    
};