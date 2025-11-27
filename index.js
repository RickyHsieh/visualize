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
    
    // 場景配置
    PARTICLE_COUNT: 1500,
    HEIGHTMAP_COLS: 160,
    HEIGHTMAP_ROWS: 60,
    
    // 音頻檢測範圍
    BEAT_THRESHOLD: 0.1,
    VOLUME_HISTORY_SIZE: 20
};

if (typeof window !== 'undefined' && typeof window.polySynth === 'undefined') {
    window.polySynth = null;
}

const createCameraState = (overrides = {}) => ({
    rotationX: 0,
    rotationY: 0,
    zoom: 1,
    lastMouseX: 0,
    lastMouseY: 0,
    dragging: false,
    enabled: true,
    ...overrides
});

// ============================================================================
// 全局狀態
// ============================================================================
const State = {
    scene: 0,
    isMicOn: false,
    particles: [],
    faradayParticles: [], // 用於 Faraday Ripple 場景的粒子 (3D X, Z 座標)
    toneRipples: [], // 12 個音調區域的波紋緩衝狀態
    cameras: [] // 每個場景的相機狀態
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
    },
    
    getDominantFrequency() {
        if (!this.spectrum || this.spectrum.length === 0) {
            return { freq: 0, confidence: 0 };
        }
        let spectrum = this.spectrum;
        let maxVal = 0;
        let maxIndex = 0;
        let sum = 0;
        let count = 0;
        let start = 2;
        let end = Math.floor(spectrum.length / 2);
        for (let i = start; i < end; i++) {
            let val = spectrum[i];
            sum += val;
            count++;
            if (val > maxVal) {
                maxVal = val;
                maxIndex = i;
            }
        }
        if (maxVal < 1 || count === 0) {
            return { freq: 0, confidence: 0 };
        }
        let avg = sum / count;
        let confidence = avg > 0 ? (maxVal - avg) / 255 : maxVal / 255;
        confidence = constrain(confidence, 0, 1);
        let nyquist = sampleRate() / 2;
        let freq = (maxIndex / spectrum.length) * nyquist;
        return { freq, confidence };
    }
};

// ============================================================================
// Pitch Detection 模塊 - 音高檢測
// ============================================================================
const PitchDetection = {
    currentNote: "i am Listening",
    currentFrequency: 0,
    smoothedFrequency: 0,
    pitchConfidence: 0,
    currentNoteIndex: -1,
    pitchHue: 200,
    
    update() {
        if (!State.isMicOn) {
            this.reset();
            return;
        }
        const { freq, confidence } = Audio.getDominantFrequency();
        if (freq > 40 && confidence > 0.02) {
            this.pitchConfidence = lerp(this.pitchConfidence, confidence, 0.3);
            this.currentFrequency = freq;
            this.smoothedFrequency = this.smoothedFrequency === 0
                ? freq
                : lerp(this.smoothedFrequency, freq, 0.4);
            this.currentNote = this.freqToNote(freq);
            if (this.currentNoteIndex >= 0) {
                this.pitchHue = (this.currentNoteIndex * 30 + 180) % 360;
            } else {
                this.pitchHue = map(freq, 40, sampleRate() / 2, 200, 360);
            }
        } else {
            this.pitchConfidence = lerp(this.pitchConfidence, 0, 0.12);
            this.currentFrequency = 0;
            this.currentNote = "i am Listening";
            this.currentNoteIndex = -1;
            this.pitchHue = lerp(this.pitchHue, 220, 0.1);
            this.smoothedFrequency = lerp(this.smoothedFrequency, 0, 0.12);
        }
    },
    
    reset() {
        this.currentFrequency = 0;
        this.smoothedFrequency = 0;
        this.pitchConfidence = 0;
        this.currentNoteIndex = -1;
        this.currentNote = "i am Listening";
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
    getActiveCamera() {
        if (!State.cameras || State.cameras.length === 0) {
            State.cameras = [createCameraState()];
        }
        if (!State.cameras[State.scene]) {
            State.cameras[State.scene] = createCameraState();
        }
        return State.cameras[State.scene];
    },
    
    update() {
        this.currentCam = this.getActiveCamera();
        push();
        if (!this.currentCam || this.currentCam.enabled === false) {
            return;
        }
        scale(this.currentCam.zoom);
        rotateY(this.currentCam.rotationY);
        rotateX(this.currentCam.rotationX);
    },
    
    end() {
        pop();
    },
    
    mousePressed() {
        const cam = this.getActiveCamera();
        if (!cam) return;
        cam.lastMouseX = mouseX;
        cam.lastMouseY = mouseY;
        cam.dragging = true;
    },
    
    mouseReleased() {
        const cam = this.getActiveCamera();
        if (!cam) return;
        cam.dragging = false;
    },
    
    mouseDragged() {
        const cam = this.getActiveCamera();
        if (cam && cam.dragging) {
            let dx = (mouseX - cam.lastMouseX) * 0.003;
            let dy = (mouseY - cam.lastMouseY) * 0.003;
            cam.rotationY += dx;
            cam.rotationX -= dy;
            cam.lastMouseX = mouseX;
            cam.lastMouseY = mouseY;
        }
        return false;
    },
    
    mouseWheel(event) {
        const cam = this.getActiveCamera();
        if (!cam) return false;
        cam.zoom += -event.delta * 0.0006;
        cam.zoom = constrain(cam.zoom, 0.5, 2.4);
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
,
    updateDataHud(bands) {
        const hud = document.getElementById('dataHud');
        if (!hud) return;
        if (!State.isMicOn) {
            hud.innerHTML = `<div class="line">STATUS : MIC OFF</div>`;
            return;
        }
        const sceneNames = ['COSMOS', 'BASS GEO', 'HEIGHTMAP', 'FARADAY', 'FALLING'];
        const cam = Camera.getActiveCamera ? Camera.getActiveCamera() : null;
        const note = PitchDetection.currentNoteIndex >= 0 ? PitchDetection.currentNote : '---';
        const freq = PitchDetection.smoothedFrequency > 0 ? `${PitchDetection.smoothedFrequency.toFixed(1)} Hz` : '--';
        const low = Math.round(bands.low);
        const mid = Math.round(bands.mid);
        const high = Math.round(bands.high);
        const vol = `${(bands.vol * 100).toFixed(1)}%`;
        const beat = AudioFeatures.beatFlash > 0.25 ? 'YES' : 'NO';
        const peak = AudioFeatures.peakFlash > 0.25 ? 'YES' : 'NO';
        const fps = `${Math.round(frameRate())}`;
        const camRX = cam ? cam.rotationX.toFixed(2) : '--';
        const camRY = cam ? cam.rotationY.toFixed(2) : '--';
        const camZoom = cam ? cam.zoom.toFixed(2) : '--';
        const descMap = {
            'COSMOS': '音高控制色彩，頻譜驅動波動',
            'BASS GEO': '低頻推高方塊，節拍觸發閃光',
            'HEIGHTMAP': '多頻能量堆疊成等高線',
            'FARADAY': '音調分區改變色彩，波紋維持',
            'FALLING': '發出聲音生成圓圈，彈跳時播放合成音，撞擊網格消失'
        };
        const desc = descMap[sceneNames[State.scene]] || '';
        
        hud.innerHTML = `
            <div class="line">場景 : ${sceneNames[State.scene] || State.scene}</div>
            <div class="line">音高 : ${note}</div>
            <div class="line">頻率 : ${freq}</div>
            <div class="line">置信 : ${(PitchDetection.pitchConfidence * 100).toFixed(0)}%</div>
            <div class="line">低頻 : ${low}</div>
            <div class="line">中頻 : ${mid}</div>
            <div class="line">高頻 : ${high}</div>
            <div class="line">音量 : ${vol}</div>
            <div class="line">節拍 : ${beat} / 峰值 : ${peak}</div>
            <div class="line">Cam X: ${camRX}</div>
            <div class="line">Cam Y: ${camRY}</div>
            <div class="line">Zoom : ${camZoom}</div>
            <div class="line">FPS  : ${fps}</div>
            <div class="desc">${desc}</div>
        `;
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
    
    // 初始化每個場景的相機狀態
    State.cameras = [
        createCameraState({ rotationX: -0.25, rotationY: 0 }),
        createCameraState({ rotationX: -0.3, rotationY: 0.1 }),
        createCameraState({ rotationX: -0.45, rotationY: 0 }),
        createCameraState({ rotationX: -0.2, rotationY: 0, zoom: 0.95 }),
        createCameraState({ rotationX: -0.35, rotationY: 0.15, zoom: 1.05 })
    ];
    
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
    if (!window.polySynth) {
        window.polySynth = new p5.PolySynth();
        if (window.polySynth.setADSR) {
            window.polySynth.setADSR(0.01, 0.18, 0.0, 0.35);
        }
        if (window.polySynth.amp) {
            window.polySynth.amp(0.4);
        }
    }
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
        
    } else if (State.scene === 4 && typeof Scenes.drawNeonBouncingRings === 'function') {
        Scenes.drawNeonBouncingRings(bands, PitchDetection.pitchHue, AudioFeatures.peakFlash, AudioFeatures.beatFlash);
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
        UI.updateDataHud({ low: 0, mid: 0, high: 0, vol: 0 });
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
    } else if (State.scene === 4 && typeof Scenes.drawNeonBouncingRings === 'function') {
        Scenes.drawNeonBouncingRings(
            bands,
            PitchDetection.pitchHue,
            AudioFeatures.peakFlash,
            AudioFeatures.beatFlash
        );
    } else {
        // 如果場景函數不存在，顯示錯誤信息
        console.warn('Scene function not found for scene:', State.scene);
        console.log('Available scenes:', Object.keys(Scenes));
    }
    
    Camera.end();
    
    // Update UI
    UI.updatePitchDisplay();
    UI.updateDataHud(bands);
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
