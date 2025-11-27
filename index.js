// ============================================================================
// Audio Reactive Visualizer for p5.js
// 模塊化結構：功能與場景分離
// ============================================================================

// ============================================================================
// 配置與常量
// ============================================================================
const CONFIG = {
    // 音高檢測
    A4: 440, // 標準音高基準
    NOTES: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
    PITCH_MODEL_URL: 'https://cdn.jsdelivr.net/gh/ml5js/ml5-data@main/models/pitch-detection/crepe/',
    
    // 場景配置
    PARTICLE_COUNT: 1500,
    HEIGHTMAP_COLS: 160,
    HEIGHTMAP_ROWS: 60,
    
    // 音頻檢測範圍
    PITCH_MIN_FREQ: 80,
    PITCH_MAX_FREQ: 1200,
    BEAT_THRESHOLD: 0.1,
    VOLUME_HISTORY_SIZE: 20
};

// ============================================================================
// 全局狀態
// ============================================================================
const State = {
    scene: 0,
    isMicOn: false,
    particles: [],
    faradayParticles: [], // 用於 Faraday Ripple 場景的粒子 (3D X, Z 座標)
    toneRipples: [] // 12 個音調區域的波紋緩衝狀態
};

// ============================================================================
// Audio 模塊 - 音頻處理與分析
// ============================================================================
const Audio = {
    mic: null,
    fft: null,
    spectrum: [],
    
    init() {
        this.fft = new p5.FFT(0.9, 1024);
    },
    
    update() {
        if (this.fft && this.mic) {
            this.spectrum = this.fft.analyze();
        }
    },
    
    getEnergy(band) {
        return this.fft ? this.fft.getEnergy(band) : 0;
    },
    
    getLevel() {
        return this.mic ? this.mic.getLevel() : 0;
    },
    
    getFrequencyBands() {
        return {
            low: this.getEnergy("bass"),      // 20-140Hz
            mid: this.getEnergy("lowMid"),    // 140-400Hz
            high: this.getEnergy("treble"),   // 2000-6000Hz
            vol: this.getLevel()
        };
    }
};

// ============================================================================
// Pitch Detection 模塊 - 音高檢測
// ============================================================================
const PitchDetection = {
    pitch: null,
    audioContext: null,
    currentNote: "i am Listening",
    currentFrequency: 0,
    smoothedFrequency: 0,
    pitchConfidence: 0,
    currentNoteIndex: -1,
    pitchHue: 200,
    
    init() {
        // 初始化在 setupUI 中完成
    },
    
    // PitchDetection 模塊的 update 函數 (替換原代碼)
    update() {
        if (!State.isMicOn) return;
        
        // 1. 平滑頻率過渡：ML5 提供的頻率數據
        if (this.currentFrequency > 40) { // 只有在有效檢測到時才進行平滑
            // 加快平滑速度
            this.smoothedFrequency = lerp(this.smoothedFrequency, this.currentFrequency, 0.4);
        } else {
            // 無檢測信號時，緩慢衰減到零
            this.smoothedFrequency = lerp(this.smoothedFrequency, 0, 0.1);
        }
        
        // 2. 更新音符顯示 (使用平滑後的頻率)
        // 注意：freqToNote() 已經在 gotPitch() 和 detectFromFFT() 中調用
        // 這裡只需要確保顯示正確
        if (this.smoothedFrequency > 40) {
            // 如果 smoothedFrequency 有效，確保音符和索引已更新
            if (this.currentNoteIndex < 0 || this.currentNote === "i am Listening") {
                this.currentNote = this.freqToNote(this.smoothedFrequency);
            }
        } else {
            // When frequency decays to near zero, show "i am Listening"
            if (Audio.getLevel() < 0.01) { 
                this.currentNote = "i am Listening";
                this.currentNoteIndex = -1;
            } else {
                // Keep last note for visual stability
                this.pitchConfidence = lerp(this.pitchConfidence, 0, 0.1);
            }
        }
        
        // 3. 更新音高驅動的色相
        if (this.currentNoteIndex >= 0) {
            this.pitchHue = (this.currentNoteIndex * 30 + 180) % 360;
        } else {
            this.pitchHue = lerp(this.pitchHue, 220, 0.1); // 無效時返回預設藍色
        }
        
        // 如果 ML5 沒有提供頻率，使用 FFT 備用方法
        if (this.currentFrequency === 0 || this.currentFrequency < 40) {
            this.detectFromFFT();
        }
    },
    
    freqToNote(frequency) {
        let n = 12 * (Math.log(frequency / CONFIG.A4) / Math.log(2));
        let n_rounded = Math.round(n);
        let noteIndex = (n_rounded + 69) % 12;
        if (noteIndex < 0) noteIndex += 12;
        let octave = Math.floor((n_rounded + 69) / 12) - 1;
        this.currentNoteIndex = noteIndex;
        return CONFIG.NOTES[noteIndex] + octave;
    },
    
    detectFromFFT() {
        if (!Audio.spectrum || Audio.spectrum.length === 0) {
            this.currentFrequency = 0;
            this.pitchConfidence = 0;
            return;
        }
        
        // 檢查整體音量（降低閾值）
        let overallVolume = 0;
        for (let i = 0; i < Audio.spectrum.length; i++) {
            overallVolume += Audio.spectrum[i];
        }
        overallVolume /= Audio.spectrum.length;
        
        // 降低音量閾值，讓檢測更容易觸發
        if (overallVolume < 2) return;
        
        // 人聲頻率範圍
        let minFreq = CONFIG.PITCH_MIN_FREQ;
        let maxFreq = CONFIG.PITCH_MAX_FREQ;
        let sampleRate = 44100;
        let nyquist = sampleRate / 2;
        let minBin = floor((minFreq / nyquist) * Audio.spectrum.length);
        let maxBin = floor((maxFreq / nyquist) * Audio.spectrum.length);
        
        // 加權峰值檢測
        let maxAmp = 0;
        let maxIndex = 0;
        
        for (let i = minBin; i < maxBin && i < Audio.spectrum.length; i++) {
            let freq = (i / Audio.spectrum.length) * nyquist;
            let weight = 1.0;
            if (freq >= 100 && freq <= 500) {
                weight = 1.5;
            } else if (freq >= 80 && freq <= 100) {
                weight = 1.2;
            }
            
            let weightedAmp = Audio.spectrum[i] * weight;
            if (weightedAmp > maxAmp) {
                maxAmp = weightedAmp;
                maxIndex = i;
            }
        }
        
        let detectedFreq = (maxIndex / Audio.spectrum.length) * nyquist;
        
        // 計算置信度（降低閾值）
        let confidence = 0;
        if (maxAmp > 5) { // 從 8 降到 5
            let sum = 0;
            let count = 0;
            for (let i = minBin; i < maxBin && i < Audio.spectrum.length; i++) {
                sum += Audio.spectrum[i];
                count++;
            }
            let avg = count > 0 ? sum / count : 0;
            let ratio = maxAmp / max(avg, 1);
            // 降低觸發閾值，從 1.1 降到 1.05
            confidence = constrain(map(ratio, 1.05, 3, 0.1, 0.85), 0, 1);
        }
        
        // 使用 HPS 提高準確度（降低閾值）
        let hpsFreq = this.detectPitchHPS(Audio.spectrum, sampleRate);
        if (hpsFreq > 0 && confidence > 0.2) { // 從 0.4 降到 0.2
            detectedFreq = hpsFreq;
            confidence = min(confidence * 1.2, 1.0);
        }
        
        // 更新結果（降低閾值）
        if (detectedFreq >= minFreq && detectedFreq <= maxFreq && confidence > 0.05) { // 從 0.1 降到 0.05
            this.currentFrequency = detectedFreq;
            this.pitchConfidence = confidence;
            // 確保 currentNoteIndex 被更新
            this.freqToNote(detectedFreq);
        } else {
            // 只有在完全沒有信號時才重置
            if (overallVolume < 1 || maxAmp < 3) { // 降低重置閾值
                this.currentFrequency = 0;
                this.pitchConfidence = 0;
                this.currentNoteIndex = -1;
            } else {
                // 即使置信度低，也嘗試更新（用於顯示）
                if (detectedFreq >= minFreq && detectedFreq <= maxFreq && maxAmp > 3) {
                    this.currentFrequency = detectedFreq;
                    this.pitchConfidence = max(confidence, 0.1); // 至少給 0.1 的置信度
                    this.freqToNote(detectedFreq);
                }
            }
        }
    },
    
    detectPitchHPS(spectrum, sampleRate) {
        let nyquist = sampleRate / 2;
        let spectrumLength = spectrum.length;
        let minFreq = 80;
        let maxFreq = 2000;
        let minBin = floor((minFreq / nyquist) * spectrumLength);
        let maxBin = floor((maxFreq / nyquist) * spectrumLength);
        
        let hpsLength = floor(maxBin / 4);
        let hps = new Array(hpsLength).fill(1);
        
        for (let i = 0; i < hpsLength; i++) {
            for (let harmonic = 1; harmonic <= 4; harmonic++) {
                let idx = i * harmonic;
                if (idx < spectrumLength) {
                    hps[i] *= spectrum[idx] / 255.0;
                }
            }
        }
        
        let maxHPS = 0;
        let maxHPSIndex = 0;
        for (let i = minBin; i < hpsLength; i++) {
            if (hps[i] > maxHPS) {
                maxHPS = hps[i];
                maxHPSIndex = i;
            }
        }
        
        if (maxHPS > 0.01) {
            return (maxHPSIndex / spectrumLength) * nyquist;
        }
        
        return 0;
    },
    
    hsbToRgb(h, s, b) {
        h = h % 360;
        s = s / 100;
        b = b / 100;
        
        let c = b * s;
        let x = c * (1 - Math.abs((h / 60) % 2 - 1));
        let m = b - c;
        
        let r, g, blue;
        
        if (h >= 0 && h < 60) {
            r = c; g = x; blue = 0;
        } else if (h >= 60 && h < 120) {
            r = x; g = c; blue = 0;
        } else if (h >= 120 && h < 180) {
            r = 0; g = c; blue = x;
        } else if (h >= 180 && h < 240) {
            r = 0; g = x; blue = c;
        } else if (h >= 240 && h < 300) {
            r = x; g = 0; blue = c;
        } else {
            r = c; g = 0; blue = x;
        }
        
        return {
            r: Math.round((r + m) * 255),
            g: Math.round((g + m) * 255),
            b: Math.round((blue + m) * 255)
        };
    },
    
    // ml5.js 回調
    modelLoaded() {
        console.log('Pitch detection model loaded!');
        this.pitch.getPitch(this.gotPitch.bind(this));
    },
    
    gotPitch(error, frequency) {
        if (error) {
            console.error('Pitch detection error:', error);
            // 如果 ML5 失敗，使用 FFT 備用方法
            this.detectFromFFT();
        } else if (frequency) {
            // ML5/CREPE 模型已經足夠穩定，我們直接更新原始頻率
            this.currentFrequency = frequency;
            // 確保 currentNoteIndex 被正確更新
            this.freqToNote(frequency); // 這會更新 currentNoteIndex
            this.pitchConfidence = 0.9; // ML5 應給予高置信度
            
            // 確保平滑頻率更新得更快，用於視覺平滑
            this.smoothedFrequency = lerp(this.smoothedFrequency, this.currentFrequency, 0.5); // 加快 lerp 速度
        } else {
            // 如果 frequency 為 null 或 undefined，使用 FFT 備用方法
            this.detectFromFFT();
        }
        
        // 持續調用以保持檢測
        if (State.isMicOn && this.pitch) {
            this.pitch.getPitch(this.gotPitch.bind(this));
        }
    }
};

// ============================================================================
// Audio Features 模塊 - 音頻特徵檢測（峰值、節拍等）
// ============================================================================
const AudioFeatures = {
    peakDetect: null,
    peakFlash: 0,
    beatDetected: false,
    beatFlash: 0,
    volumeHistory: [],
    lastVolume: 0,
    spectralCentroid: 0,
    spectralRolloff: 0,
    
    init() {
        this.peakDetect = new p5.PeakDetect();
    },
    
    update() {
        if (!State.isMicOn || !Audio.fft) return;
        
        // 1. Peak Detection
        this.peakDetect.update(Audio.fft);
        if (this.peakDetect.isDetected) {
            this.peakFlash = 1.0;
        }
        this.peakFlash = lerp(this.peakFlash, 0, 0.15);
        
        // 2. Beat Detection
        let vol = Audio.getLevel();
        this.volumeHistory.push(vol);
        if (this.volumeHistory.length > CONFIG.VOLUME_HISTORY_SIZE) {
            this.volumeHistory.shift();
        }
        
        let volumeChange = vol - this.lastVolume;
        let avgVolume = this.volumeHistory.reduce((a, b) => a + b, 0) / this.volumeHistory.length;
        
        if (volumeChange > 0.05 && vol > avgVolume * 1.3 && vol > CONFIG.BEAT_THRESHOLD) {
            this.beatDetected = true;
            this.beatFlash = 1.0;
        } else {
            this.beatDetected = false;
        }
        this.beatFlash = lerp(this.beatFlash, 0, 0.12);
        this.lastVolume = vol;
        
        // 3. Spectral Centroid
        let sumMagnitude = 0;
        let sumWeighted = 0;
        for (let i = 0; i < Audio.spectrum.length; i++) {
            let magnitude = Audio.spectrum[i];
            sumMagnitude += magnitude;
            sumWeighted += i * magnitude;
        }
        if (sumMagnitude > 0) {
            this.spectralCentroid = (sumWeighted / sumMagnitude) / Audio.spectrum.length;
        }
        
        // 4. Spectral Rolloff
        let totalEnergy = 0;
        let rolloffEnergy = 0;
        for (let i = 0; i < Audio.spectrum.length; i++) {
            totalEnergy += Audio.spectrum[i];
        }
        if (totalEnergy > 0) {
            for (let i = 0; i < Audio.spectrum.length; i++) {
                rolloffEnergy += Audio.spectrum[i];
                if (rolloffEnergy / totalEnergy >= 0.85) {
                    this.spectralRolloff = i / Audio.spectrum.length;
                    break;
                }
            }
        }
    }
};

// ============================================================================
// Scenes 模塊 - 視覺場景（從外部文件載入）
// ============================================================================
// Scenes 對象將由 scenes/*.js 文件填充
// 確保使用全局 Scenes 對象（由場景文件創建）
if (typeof window.Scenes === 'undefined') {
    window.Scenes = {};
}
// 使用全局 Scenes 對象的引用
const Scenes = window.Scenes;

// ============================================================================
// Camera 模塊 - 相機控制
// ============================================================================
const Camera = {
    rotationX: 0,
    rotationY: 0,
    lastMouseX: 0,
    lastMouseY: 0,
    dragging: false,
    zoom: 1.0,
    
    update() {
        push();
        scale(this.zoom);
        // 改变旋转顺序：先 Y 后 X，以获得更直观的旋转行为
        rotateY(this.rotationY);
        rotateX(this.rotationX);
    },
    
    end() {
        pop();
    },
    
    mousePressed() {
        this.lastMouseX = mouseX;
        this.lastMouseY = mouseY;
        this.dragging = true;
    },
    
    mouseReleased() {
        this.dragging = false;
    },
    
    mouseDragged() {
        if (this.dragging) {
            let dx = (mouseX - this.lastMouseX) * 0.003;
            let dy = (mouseY - this.lastMouseY) * 0.003;
            // 修正方向：往左拖拽看到右边（顺时针），往右拖拽看到左边（逆时针）
            // 往下拖拽看到顶部，往上拖拽看到底部
            this.rotationY += dx;  // 恢复原始方向，但配合旋转顺序调整
            this.rotationX -= dy;  // 保持垂直方向的反转
            this.lastMouseX = mouseX;
            this.lastMouseY = mouseY;
        }
        return false;
    },
    
    mouseWheel(event) {
        this.zoom += -event.delta * 0.0006;
        this.zoom = constrain(this.zoom, 0.5, 2.4);
        return false;
    }
};

// ============================================================================
// UI 模塊 - 界面控制與顯示
// ============================================================================
const UI = {
    setup() {
        // Scene buttons
        const ui = document.getElementById('ui');
        ui.querySelectorAll('button[data-scene]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                ui.querySelectorAll('button[data-scene]').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                State.scene = Number(e.currentTarget.dataset.scene);
            });
        });
        
        // Mic button
        const micBtn = document.getElementById('micBtn');
        micBtn.addEventListener('click', async () => {
            if (!State.isMicOn) {
                await this.startMic(micBtn);
            } else {
                this.stopMic(micBtn);
            }
        });
    },
    
    async startMic(micBtn) {
        micBtn.textContent = 'Starting...';
        micBtn.disabled = true;
        
        try {
            await userStartAudio();
            console.log('AudioContext resumed');
        } catch (audioErr) {
            console.warn('userStartAudio warning:', audioErr);
        }
        
        try {
            if (!Audio.mic) {
                Audio.mic = new p5.AudioIn();
            }
            Audio.mic.start();
            await new Promise(resolve => setTimeout(resolve, 400));
            
            let testLevel = Audio.mic.getLevel();
            Audio.fft.setInput(Audio.mic);
            
            State.isMicOn = true;
            micBtn.textContent = 'Mic Enabled';
            micBtn.classList.add('active');
            micBtn.disabled = false;
            
            // Initialize pitch detection
            try {
                PitchDetection.audioContext = getAudioContext();
                if (typeof ml5 !== 'undefined' && ml5.pitchDetection) {
                    let micStream = Audio.mic.stream || Audio.mic.input || (Audio.mic.mediaStream ? Audio.mic.mediaStream : null);
                    if (micStream) {
                        PitchDetection.pitch = ml5.pitchDetection(
                            CONFIG.PITCH_MODEL_URL,
                            PitchDetection.audioContext,
                            micStream,
                            PitchDetection.modelLoaded.bind(PitchDetection)
                        );
                    }
                }
            } catch (pitchErr) {
                console.warn('Pitch detection initialization failed:', pitchErr);
            }
            
        } catch (err) {
            console.error('Microphone initialization error:', err);
            micBtn.textContent = 'Failed, allow Mic';
            micBtn.classList.remove('active');
            micBtn.disabled = false;
            State.isMicOn = false;
            
            if (Audio.mic && Audio.mic.stop) {
                Audio.mic.stop();
            }
        }
    },
    
    stopMic(micBtn) {
        try {
            if (Audio.mic && Audio.mic.stop) {
                Audio.mic.stop();
            }
            State.isMicOn = false;
            micBtn.textContent = 'Start Mic';
            micBtn.classList.remove('active');
            PitchDetection.currentNote = "i am Listening";
        } catch (err) {
            console.error('Error stopping microphone:', err);
        }
    },
    
    updatePitchDisplay() {
        if (!State.isMicOn) {
            let pitchDisplay = document.getElementById('pitchDisplay');
            if (pitchDisplay) pitchDisplay.style.display = 'none';
            return;
        }
        
        let pitchDisplay = document.getElementById('pitchDisplay');
        let pitchNote = document.getElementById('pitchNote');
        let pitchFreq = document.getElementById('pitchFreq');
        let pitchConfidenceValue = document.getElementById('pitchConfidenceValue');
        let pitchBarFill = document.getElementById('pitchBarFill');
        
        if (!pitchDisplay) return;
        
        pitchDisplay.style.display = 'block';
        
        if (pitchNote) {
            // Prefer currentNote, if invalid calculate from frequency
            let noteText = "i am Listening";
            if (PitchDetection.currentNote && 
                PitchDetection.currentNote !== "Listening..." && 
                PitchDetection.currentNote !== "Processing..." &&
                PitchDetection.currentNote !== "i am Listening") {
                noteText = PitchDetection.currentNote;
            } else if (PitchDetection.currentFrequency > 40) {
                // Even if currentNote is not set, try to calculate from frequency
                noteText = PitchDetection.freqToNote(PitchDetection.currentFrequency);
            }
            pitchNote.textContent = noteText;
            
            if (PitchDetection.currentNoteIndex >= 0) {
                let rgb = PitchDetection.hsbToRgb(PitchDetection.pitchHue, 80, 95);
                pitchNote.style.color = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
            } else {
                pitchNote.style.color = '#ffffff';
            }
        }
        
        if (pitchFreq) {
            let displayFreq = PitchDetection.smoothedFrequency > 0 
                ? PitchDetection.smoothedFrequency 
                : PitchDetection.currentFrequency;
            if (displayFreq > 40) { // Lower display threshold
                pitchFreq.textContent = `${displayFreq.toFixed(1)} Hz`;
            } else {
                pitchFreq.textContent = "i am Listening";
            }
        }
        
        if (pitchConfidenceValue && pitchBarFill) {
            let confidencePercent = (PitchDetection.pitchConfidence * 100).toFixed(0);
            pitchConfidenceValue.textContent = `${confidencePercent}%`;
            pitchBarFill.style.width = `${PitchDetection.pitchConfidence * 100}%`;
        }
    }
};

// ============================================================================
// Main - p5.js 主函數
// ============================================================================
function setup() {
    let cnv = createCanvas(windowWidth, windowHeight, WEBGL);
    cnv.style('position', 'fixed');
    cnv.style('top', '0'); cnv.style('left', '0'); cnv.style('z-index', '0');
    colorMode(HSB, 360, 100, 100, 1); noStroke(); pixelDensity(1);
    
    // 初始化 3D 粒子 (State.particles) - 保持不變
    for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
        State.particles.push({
            pos: createVector(random(-width, width), random(-height * 0.3, height * 0.4), random(-600, 600)),
            vel: createVector(0, 0, 0), size: random(1.5, 4.5), hue: random(180, 260)
        });
    }
    
    // 初始化 Faraday 粒子 (微珠粒子) - 修復為 3D 座標 (X, Z)
    let particleSpacing = 12; // 粒子間距
    let gridSize = 800; // 網格大小 (擴大以適應 3D 視角)
    let gridW = floor(gridSize / particleSpacing);
    let gridH = floor(gridSize / particleSpacing);
    
    for (let j = 0; j < gridH; j++) {
        for (let i = 0; i < gridW; i++) {
            // X, Z 座標從 -gridSize/2 到 gridSize/2
            let x = map(i, 0, gridW - 1, -gridSize/2, gridSize/2);
            let z = map(j, 0, gridH - 1, -gridSize/2, gridSize/2);
            State.faradayParticles.push({
                pos: createVector(x, 0, z), // 初始 Y=0 (平面)
                size: 3 // 固定大小
            });
        }
    }
    
    // 初始化 ToneRipples (12 個音調區域的波紋緩衝)
    State.toneRipples = [];
    for (let i = 0; i < 12; i++) {
        let baseAmp = 0.2 + sin(i * 0.5) * 0.08; // 基礎振幅（確保有波動）
        State.toneRipples.push({
            amplitude: baseAmp, // 初始振幅設為基礎振幅，確保有波動
            baseAmplitude: baseAmp,
            releaseRate: 0.02,
            time: 0, // 基礎漣漪時間從 0 開始
            isActive: false
        });
    }
    
    Audio.init(); AudioFeatures.init(); UI.setup();
    console.log('Faraday particles initialized:', State.faradayParticles.length);
}

function draw() {
    background(0);
    
    if (!State.isMicOn) { /* ... 靜態背景邏輯保持不變 ... */ return; }
    
    Audio.update(); AudioFeatures.update(); PitchDetection.update();
    let bands = Audio.getFrequencyBands();
    
    // --- 更新 ToneRipples (核心 Attack/Release 邏輯) ---
    let currentPitchIndex = PitchDetection.currentNoteIndex;
    let hasAudio = bands.vol > 0.01;
    
    for (let i = 0; i < State.toneRipples.length; i++) {
        let ripple = State.toneRipples[i];
        let target = ripple.baseAmplitude; // 目標設為基礎振幅（確保基礎漣漪持續）
        
        if (hasAudio && currentPitchIndex >= 0 && currentPitchIndex < 12 && i === currentPitchIndex) {
            // 當檢測到音調時，增加目標振幅
            let audioBoost = map(bands.vol, 0, 0.3, 0.4, 1.2);
            target = ripple.baseAmplitude + audioBoost;
        }
        
        // Attack/Release 邏輯
        if (target > ripple.amplitude) {
            // Attack：快速上升
            ripple.amplitude = lerp(ripple.amplitude, target, 0.15);
            if (target > ripple.baseAmplitude) { 
                ripple.time = 0; // 重置時間，讓新漣漪從中心開始
                ripple.isActive = true; 
            }
        } else {
            // Release：緩慢下降
            ripple.amplitude = lerp(ripple.amplitude, target, ripple.releaseRate);
            if (abs(ripple.amplitude - ripple.baseAmplitude) < 0.01) { 
                ripple.isActive = false; 
            }
        }
        
        // 更新漣漪時間（基礎漣漪始終持續擴散）
        if (ripple.isActive) {
            // 音調漣漪：快速擴散
            ripple.time += 0.2; // 加快擴散速度
        } else {
            // 基礎漣漪：持續擴散（從中心不斷向外）
            ripple.time = frameCount * 0.05; // 基礎漣漪時間持續增加（加快速度）
        }
    }
    // ----------------------------------------------------
    
    // Draw scene
    Camera.update(); // 啟用 3D 轉換

    if (State.scene === 3 && typeof Scenes.drawFaradayMicrobeads === 'function') {
        // --- 3D Faraday 邏輯 ---
        let pitchData = {
            currentNote: PitchDetection.currentNote,
            currentPitchIndex: PitchDetection.currentNoteIndex
        };
        let effects = {
            peakFlash: AudioFeatures.peakFlash,
            beatFlash: AudioFeatures.beatFlash,
            spectrum: Audio.spectrum
        };
        
        Scenes.drawFaradayMicrobeads(State.faradayParticles, bands, pitchData, effects, State.toneRipples);
        
    } else if (State.scene === 0 && typeof Scenes.drawCosmosParticles === 'function') {
        Scenes.drawCosmosParticles(bands, PitchDetection.pitchHue, AudioFeatures.peakFlash, AudioFeatures.beatFlash);
    } else if (State.scene === 1 && typeof Scenes.drawBassGeometry === 'function') {
        Scenes.drawBassGeometry(bands, PitchDetection.pitchHue, AudioFeatures.peakFlash, AudioFeatures.beatFlash);
    } else if (State.scene === 2 && typeof Scenes.drawParticleHeightmap === 'function') {
        Scenes.drawParticleHeightmap(bands, PitchDetection.pitchHue, AudioFeatures.peakFlash, AudioFeatures.beatFlash);
    } else {
        // 如果場景函數不存在，顯示錯誤信息
        console.warn('Scene function not found for scene:', State.scene);
        console.log('Available scenes:', Object.keys(Scenes));
    }
    
    Camera.end(); // 結束 3D 轉換
    
    // 在 Canvas 內繪製音高顯示
    // drawPitchDisplayInCanvas(); // 假設這個函數存在
}

function draw() {
    background(0);
    
    if (!State.isMicOn) {
        push();
        rotateX(-0.3 + sin(frameCount * 0.002) * 0.02);
        rotateY(frameCount * 0.0003);
        if (typeof Scenes.drawStaticStars === 'function') {
            Scenes.drawStaticStars();
        }
        pop();
        return;
    }
    
    // Update audio analysis
    Audio.update();
    AudioFeatures.update();
    PitchDetection.update();
    
    // Get frequency bands
    let bands = Audio.getFrequencyBands();
    
    // Draw scene (所有場景都使用 3D 相機)
    Camera.update();
    
    if (State.scene === 0 && typeof Scenes.drawCosmosParticles === 'function') {
        Scenes.drawCosmosParticles(bands, PitchDetection.pitchHue, AudioFeatures.peakFlash, AudioFeatures.beatFlash);
    } else if (State.scene === 1 && typeof Scenes.drawBassGeometry === 'function') {
        Scenes.drawBassGeometry(bands, PitchDetection.pitchHue, AudioFeatures.peakFlash, AudioFeatures.beatFlash);
    } else if (State.scene === 2 && typeof Scenes.drawParticleHeightmap === 'function') {
        Scenes.drawParticleHeightmap(bands, PitchDetection.pitchHue, AudioFeatures.peakFlash, AudioFeatures.beatFlash);
    } else if (State.scene === 3 && typeof Scenes.drawFaradayMicrobeads === 'function') {
        // 準備參數對象
        let pitchData = {
            currentNote: PitchDetection.currentNote,
            currentPitchIndex: PitchDetection.currentNoteIndex
        };
        let effects = {
            peakFlash: AudioFeatures.peakFlash,
            beatFlash: AudioFeatures.beatFlash,
            spectrum: Audio.spectrum
        };
        // 調用 3D 版本函數，傳遞 ToneRipples
        Scenes.drawFaradayMicrobeads(
            State.faradayParticles,
            bands,
            pitchData,
            effects,
            State.toneRipples
        );
    } else {
        // 如果場景函數不存在，顯示錯誤信息
        console.warn('Scene function not found for scene:', State.scene);
        console.log('Available scenes:', Object.keys(Scenes));
    }
    
    Camera.end();
    
    // Update UI
    UI.updatePitchDisplay();
}

// ============================================================================
// Event Handlers
// ============================================================================
function mousePressed() {
    Camera.mousePressed();
}

function mouseReleased() {
    Camera.mouseReleased();
}

function mouseDragged() {
    Camera.mouseDragged();
}

function mouseWheel(event) {
    Camera.mouseWheel(event);
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}
