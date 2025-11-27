// ============================================================================
// Scene 2: Particle Heightmap (粒子高度圖)
// ============================================================================

// 確保 Scenes 對象存在
if (typeof window.Scenes === 'undefined') {
    window.Scenes = {};
}

window.Scenes.drawParticleHeightmap = function(bands, pitchHue, peakFlash, beatFlash) {
    push();
    rotateX(PI * 0.28);
    translate(0, 60, -200);
    
    // 確保有基礎波動，即使沒有音頻
    let hasAudio = bands.vol > 0.01;
    let baseAmp = hasAudio 
        ? map(bands.low, 0, 255, 30, 280)
        : 50 + sin(frameCount * 0.02) * 20; // 基礎波動
    let midWave = hasAudio 
        ? map(bands.mid, 0, 255, 0, 50)
        : 10 + sin(frameCount * 0.03) * 5;
    let highWave = hasAudio 
        ? map(bands.high, 0, 255, 0, 30)
        : 5 + sin(frameCount * 0.04) * 3;
    let volMultiplier = hasAudio 
        ? map(bands.vol, 0, 0.3, 1.0, 2.5)
        : 1.0;
    
    if (beatFlash > 0.3) {
        baseAmp *= (1 + beatFlash * 0.3);
        volMultiplier *= (1 + beatFlash * 0.2);
    }
    
    let maxAmp = (baseAmp + midWave + highWave) * volMultiplier;
    let minAmp = -maxAmp * 0.3;
    
    // 確保 Audio.spectrum 存在
    let spectrum = Audio.spectrum || [];
    let spectrumLength = spectrum.length > 0 ? spectrum.length : 1024;
    
    for (let j = -CONFIG.HEIGHTMAP_ROWS/2; j < CONFIG.HEIGHTMAP_ROWS/2; j++) {
        let y = j * (height / CONFIG.HEIGHTMAP_ROWS);
        beginShape();
        for (let i = -CONFIG.HEIGHTMAP_COLS/2; i < CONFIG.HEIGHTMAP_COLS/2; i++) {
            let x = i * (width / CONFIG.HEIGHTMAP_COLS);
            
            let spectrumIdx = floor(map(i + CONFIG.HEIGHTMAP_COLS/2, 0, CONFIG.HEIGHTMAP_COLS, 0, spectrumLength - 1));
            spectrumIdx = constrain(spectrumIdx, 0, spectrumLength - 1);
            let spectrumAmp = spectrum.length > 0 ? (spectrum[spectrumIdx] || 0) / 255.0 : 0;
            
            let noiseVal = noise(i * 0.12 + frameCount * 0.01, j * 0.14);
            let baseH = (noiseVal - 0.5) * baseAmp;
            let midH = sin((frameCount + i * 3) * 0.05) * midWave;
            let highH = sin((frameCount * 2 + i * 5 + j * 3) * 0.08) * highWave;
            let spectrumH = spectrumAmp * baseAmp * 0.6;
            
            if (peakFlash > 0.2) {
                spectrumH += peakFlash * baseAmp * 0.3;
            }
            
            let h = (baseH + midH + highH + spectrumH) * volMultiplier;
            let z = map(h, minAmp, maxAmp, -200, 200);
            
            strokeWeight(1.2 + peakFlash * 0.5);
            
            let baseHue = PitchDetection.currentNoteIndex >= 0 ? pitchHue : map(j + CONFIG.HEIGHTMAP_ROWS/2, 0, CONFIG.HEIGHTMAP_ROWS, 200, 280);
            let hue = (baseHue + map(i, -CONFIG.HEIGHTMAP_COLS/2, CONFIG.HEIGHTMAP_COLS/2, -15, 15)) % 360;
            let saturation = 70 + beatFlash * 15;
            let brightness = map(abs(h), 0, maxAmp, 40, 100) + bands.high * 0.3 + peakFlash * 20;
            
            stroke(hue, saturation, brightness, 0.9);
            noFill();
            vertex(x, y, z);
        }
        endShape();
    }
    pop();
    
    // Particle sparks
    push();
    translate(0, map(bands.high, 0, 255, 20, 120), 0);
    for (let i = 0; i < 200; i++) {
        let angle = (i / 200) * TWO_PI + frameCount * 0.01;
        let r = 200 + (i % 10) * 2 + map(bands.mid, 0, 255, 0, 80);
        let x = cos(angle) * r;
        let y = sin(angle) * r * 0.25;
        let z = sin(i * 0.3 + frameCount * 0.05) * 30;
        push();
        translate(x, y, z);
        
        let sparkHue = PitchDetection.currentNoteIndex >= 0 
            ? (pitchHue + map(i, 0, 200, -30, 30)) % 360
            : map(i, 0, 200, 0, 360);
        let sparkBrightness = map(bands.high, 0, 255, 40, 100) + peakFlash * 20;
        
        fill(sparkHue, 80, sparkBrightness, 0.9);
        let sparkSize = 1.6;
        if (spectrum.length > 0) {
            sparkSize += map(spectrum[i % spectrum.length] || 0, 0, 255, 0, 3) * (1 + beatFlash * 0.2);
        }
        sphere(sparkSize);
        pop();
    }
    pop();
};
