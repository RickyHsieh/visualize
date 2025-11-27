// ============================================================================
// Audio Reactive Visualizer for p5.js
// 主程序：負責音頻分析、狀態管理、相機控制與場景調度
// ============================================================================

// ============================================================================
// 配置與常量
// ============================================================================
const CONFIG = {
    // 音高檢測
    A4: 440, // 標準音高基準
    NOTES: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],

    // 場景配置
    PARTICLE_COUNT: 1500, // Cosmos 場景粒子數
    HEIGHTMAP_ROWS: 60,
    HEIGHTMAP_COLS: 90,

    // 音頻檢測範圍
    BEAT_THRESHOLD: 0.1,
    VOLUME_HISTORY_SIZE: 20
};

// 確保全局 polySynth 存在 (用於 Scene 4 發聲)
if (typeof window !== 'undefined' && typeof window.polySynth === 'undefined') {
    window.polySynth = null;
}

// 相機狀態創建輔助函數
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
// 全局狀態 (State)
// ============================================================================
const State = {
    scene: 0,           // 當前場景索引
    isMicOn: false,     // 麥克風狀態
    particles: [],      // 用於 Cosmos 場景的粒子
    faradayParticles: [], // 用於 Faraday Ripple 場景的微珠粒子 (3D 座標)
    toneRipples: [],    // 12 個音調區域的波紋物理狀態緩衝
    cameras: []         // 存儲每個場景獨立的相機狀態
};

// ============================================================================
// Audio 模塊 - 音頻處理與分析 (修正高頻版)
// ============================================================================
const Audio = {
    mic: null,
    fft: null,
    spectrum: [],

    init() {
        this.fft = new p5.FFT(0.8, 1024);
    },

    update() {
        if (this.fft && this.mic) {
            this.spectrum = this.fft.analyze();
        }
    },

    getEnergy(low, high) {
        return this.fft ? this.fft.getEnergy(low, high) : 0;
    },

    getLevel() {
        return this.mic ? this.mic.getLevel() : 0;
    },

    // 獲取標準化的頻段能量與總音量
    getFrequencyBands() {
        // 1. 低頻 (Bass): 20-140Hz
        let low = this.getEnergy(20, 140);

        // 2. 中頻 (Mid): 140Hz - 2000Hz
        // (範圍稍微縮小，把 2000Hz 以上讓給高頻)
        let mid = this.getEnergy(140, 2000);

        // 3. 高頻 (High): 2000Hz - 16000Hz
        // (範圍擴大：涵蓋了原本的高頻與超高頻區域)
        let rawHigh = this.getEnergy(2000, 16000);

        // 【修正高頻沒值】：放大倍率提高到 3.5 倍
        let high = Math.min(rawHigh * 3.5, 255);

        // 【已移除 Ultra 超高頻】

        return {
            low,
            mid,
            high,
            vol: this.getLevel()
        };
    },

    // 計算主導頻率 (用於輔助音高檢測)
    getDominantFrequency() {
        if (!this.spectrum || this.spectrum.length === 0) {
            return { freq: 0, confidence: 0 };
        }
        let spectrum = this.spectrum;
        let maxVal = 0;
        let maxIndex = 0;
        let sum = 0;
        let count = 0;

        let nyquist = sampleRate() / 2;
        let binSize = nyquist / spectrum.length;

        let start = Math.floor(60 / binSize);
        let end = Math.floor(1200 / binSize);

        end = Math.min(end, spectrum.length);

        for (let i = start; i < end; i++) {
            let val = spectrum[i];
            sum += val;
            count++;
            if (val > maxVal) {
                maxVal = val;
                maxIndex = i;
            }
        }

        if (maxVal < 50 || count === 0) {
            return { freq: 0, confidence: 0 };
        }

        let avg = sum / count;
        let confidence = avg > 0 ? (maxVal - avg) / 255 : maxVal / 255;
        confidence = constrain(confidence, 0, 1);

        let freq = (maxIndex / spectrum.length) * nyquist;
        return { freq, confidence };
    }
};

// ============================================================================
// Pitch Detection 模塊 - 音高檢測與平滑處理
// ============================================================================
const PitchDetection = {
    currentNote: "0.0 Hz",
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

            this.freqToNote(freq);
            const displayFreq = this.smoothedFrequency > 0 ? this.smoothedFrequency : freq;
            this.currentNote = `${displayFreq.toFixed(1)} Hz`;

            if (this.currentNoteIndex >= 0) {
                this.pitchHue = (this.currentNoteIndex * 30 + 180) % 360;
            } else {
                this.pitchHue = map(freq, 40, sampleRate() / 2, 200, 360);
            }
        } else {
            this.pitchConfidence = lerp(this.pitchConfidence, 0, 0.12);
            this.currentFrequency = 0;
            const displayFreq = Math.max(this.smoothedFrequency, 0);
            this.currentNote = `${displayFreq.toFixed(1)} Hz`;
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
        this.currentNote = "0.0 Hz";
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
        h = h % 360; s = s / 100; b = b / 100;
        let c = b * s;
        let x = c * (1 - Math.abs((h / 60) % 2 - 1));
        let m = b - c;
        let r, g, blue;
        if (h >= 0 && h < 60) { r = c; g = x; blue = 0; }
        else if (h >= 60 && h < 120) { r = x; g = c; blue = 0; }
        else if (h >= 120 && h < 180) { r = 0; g = c; blue = x; }
        else if (h >= 180 && h < 240) { r = 0; g = x; blue = c; }
        else if (h >= 240 && h < 300) { r = x; g = 0; blue = c; }
        else { r = c; g = 0; blue = x; }
        return {
            r: Math.round((r + m) * 255),
            g: Math.round((g + m) * 255),
            b: Math.round((blue + m) * 255)
        };
    }
};

// ============================================================================
// Audio Features 模塊 - 音頻特徵檢測
// ============================================================================
const AudioFeatures = {
    peakDetect: null,
    peakFlash: 0,
    beatDetected: false,
    beatFlash: 0,
    volumeHistory: [],
    lastVolume: 0,

    init() {
        this.peakDetect = new p5.PeakDetect();
    },

    update() {
        if (!State.isMicOn || !Audio.fft) return;

        this.peakDetect.update(Audio.fft);
        if (this.peakDetect.isDetected) {
            this.peakFlash = 1.0;
        }
        this.peakFlash = lerp(this.peakFlash, 0, 0.15);

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
    }
};

// ============================================================================
// Scenes 模塊 - 視覺場景
// ============================================================================
if (typeof window.Scenes === 'undefined') {
    window.Scenes = {};
}
const Scenes = window.Scenes;

// ============================================================================
// Camera 模塊 - 3D 相機控制
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
// UI 模塊 - 界面控制與顯示 (已移除 Ultra 顯示)
// ============================================================================
const UI = {
    setup() {
        const ui = document.getElementById('ui');
        ui.querySelectorAll('button[data-scene]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                ui.querySelectorAll('button[data-scene]').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                State.scene = Number(e.currentTarget.dataset.scene);
            });
        });

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
            PitchDetection.reset();
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

        if (!pitchDisplay) return;

        pitchDisplay.style.display = 'block';

        if (pitchNote) {
            const displayFreq = PitchDetection.smoothedFrequency > 0
                ? PitchDetection.smoothedFrequency
                : PitchDetection.currentFrequency;
            const freqText = `${Math.max(displayFreq, 0).toFixed(1)} Hz`;
            pitchNote.textContent = freqText;

            if (PitchDetection.currentNoteIndex >= 0) {
                let rgb = PitchDetection.hsbToRgb(PitchDetection.pitchHue, 80, 95);
                pitchNote.style.color = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
                pitchNote.style.textShadow = `
                    0 0 3px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.75),
                    0 0 10px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)
                `;
            } else {
                pitchNote.style.color = '#d6fffc';
                pitchNote.style.textShadow = '0 0 3px rgba(140,255,240,0.75), 0 0 10px rgba(140,255,240,0.4)';
            }
        }
    },

    // 更新數據儀表板 (已移除 Ultra)
    updateDataHud(bands) {
        const hud = document.getElementById('dataHud');
        if (!hud) return;
        if (!State.isMicOn) {
            hud.innerHTML = `<div class="line">STATUS : MIC OFF</div><div class="desc">Waiting for input...</div>`;
            return;
        }

        const sceneNames = ['COSMOS', 'BASS GEO', 'HEIGHTMAP', 'FARADAY', 'FALLING'];
        const cam = Camera.getActiveCamera();

        const note = PitchDetection.currentNote || '0.0 Hz';
        const freq = PitchDetection.smoothedFrequency > 0 ? `${PitchDetection.smoothedFrequency.toFixed(1)} Hz` : '--';
        const low = Math.round(bands.low || 0);
        const mid = Math.round(bands.mid || 0);
        const high = Math.round(bands.high || 0);
        // Ultra 已移除
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
            <div class="line">FPS  : ${fps}</div>
            <div class="desc">${desc}</div>
        `;
    }
};

// ============================================================================
// Main - p5.js 主函數 (Setup & Draw)
// ============================================================================
function setup() {
    let cnv = createCanvas(windowWidth, windowHeight, WEBGL);
    cnv.style('position', 'fixed');
    cnv.style('top', '0'); cnv.style('left', '0'); cnv.style('z-index', '0');

    colorMode(HSB, 360, 100, 100, 1);
    noStroke();
    pixelDensity(1);

    // 1. Cosmos 場景粒子
    for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
        State.particles.push({
            pos: createVector(random(-width, width), random(-height * 0.3, height * 0.4), random(-600, 600)),
            vel: createVector(0, 0, 0),
            size: random(1.5, 4.5),
            hue: random(180, 260)
        });
    }

    // 2. Faraday Ripple 場景微珠粒子網格
    let particleSpacing = 14;
    let gridSize = 800;

    let gridW = floor(gridSize / particleSpacing);
    let gridH = floor(gridSize / particleSpacing);

    State.faradayParticles = [];

    for (let j = 0; j < gridH; j++) {
        for (let i = 0; i < gridW; i++) {
            let x = map(i, 0, gridW - 1, -gridSize/2, gridSize/2);
            let z = map(j, 0, gridH - 1, -gridSize/2, gridSize/2);
            State.faradayParticles.push({
                pos: createVector(x, 0, z),
                size: 3
            });
        }
    }

    console.log('Faraday particles initialized:', State.faradayParticles.length);

    // 相機初始化
    State.cameras = [
        createCameraState({ rotationX: -0.25, rotationY: 0 }),
        createCameraState({ rotationX: -0.3, rotationY: 0.1 }),
        createCameraState({ rotationX: -0.45, rotationY: 0 }),
        createCameraState({ rotationX: -0.2, rotationY: 0, zoom: 0.95 }),
        createCameraState({ rotationX: -0.35, rotationY: 0.15, zoom: 1.05 })
    ];

    // ToneRipples 初始化
    State.toneRipples = [];
    for (let i = 0; i < 12; i++) {
        let baseAmp = 0.2 + sin(i * 0.5) * 0.08;
        State.toneRipples.push({
            amplitude: baseAmp,
            baseAmplitude: baseAmp,
            releaseRate: 0.02,
            time: 0,
            isActive: false
        });
    }

    Audio.init();
    AudioFeatures.init();
    UI.setup();

    if (!window.polySynth) {
        window.polySynth = new p5.PolySynth();
        if (window.polySynth.setADSR) {
            window.polySynth.setADSR(0.01, 0.1, 0.0, 0.2);
        }
        if (window.polySynth.amp) {
            window.polySynth.amp(0.5);
        }
    }

    console.log('System initialized. Faraday particles:', State.faradayParticles.length);
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

    Audio.update();
    AudioFeatures.update();
    PitchDetection.update();

    let bands = Audio.getFrequencyBands();

    // 更新 Faraday Ripple 物理 (雖然 Scene 4 已改版，但保留舊結構相容性)
    let currentPitchIndex = PitchDetection.currentNoteIndex;
    let hasAudio = bands.vol > 0.01;

    for (let i = 0; i < State.toneRipples.length; i++) {
        let ripple = State.toneRipples[i];
        let target = ripple.baseAmplitude;

        if (hasAudio && currentPitchIndex >= 0 && currentPitchIndex < 12 && i === currentPitchIndex) {
            let audioBoost = map(bands.vol, 0, 0.3, 0.4, 1.2);
            target = ripple.baseAmplitude + audioBoost;
        }

        if (target > ripple.amplitude) {
            ripple.amplitude = lerp(ripple.amplitude, target, 0.15);
            if (target > ripple.baseAmplitude * 1.1) {
                if (!ripple.isActive) ripple.time = 0;
                ripple.isActive = true;
            }
        } else {
            ripple.amplitude = lerp(ripple.amplitude, target, ripple.releaseRate);
            if (abs(ripple.amplitude - ripple.baseAmplitude) < 0.05) {
                ripple.isActive = false;
            }
        }

        if (ripple.isActive) {
            ripple.time += 0.25;
        } else {
            ripple.time += 0.08;
        }
    }

    Camera.update();

    if (State.scene === 0 && typeof Scenes.drawCosmosParticles === 'function') {
        Scenes.drawCosmosParticles(bands, PitchDetection.pitchHue, AudioFeatures.peakFlash, AudioFeatures.beatFlash);
    } else if (State.scene === 1 && typeof Scenes.drawBassGeometry === 'function') {
        Scenes.drawBassGeometry(bands, PitchDetection.pitchHue, AudioFeatures.peakFlash, AudioFeatures.beatFlash);
    } else if (State.scene === 2 && typeof Scenes.drawParticleHeightmap === 'function') {
        Scenes.drawParticleHeightmap(bands, PitchDetection.pitchHue, AudioFeatures.peakFlash, AudioFeatures.beatFlash);
    } else if (State.scene === 3 && typeof Scenes.drawFaradayMicrobeads === 'function') {
        let pitchData = {
            currentNote: PitchDetection.currentNote,
            currentPitchIndex: PitchDetection.currentNoteIndex,
            currentFrequency: PitchDetection.currentFrequency // 傳遞頻率
        };
        let effects = {
            peakFlash: AudioFeatures.peakFlash,
            beatFlash: AudioFeatures.beatFlash,
            spectrum: Audio.spectrum
        };

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
    }

    Camera.end();

    UI.updatePitchDisplay();
    UI.updateDataHud(bands);
}

function mousePressed() {
    Camera.mousePressed();
}

function mouseReleased() {
    Camera.mouseReleased();
}

function mouseDragged() {
    Camera.mouseDragged();
    return false;
}

function mouseWheel(event) {
    Camera.mouseWheel(event);
    return false;
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}