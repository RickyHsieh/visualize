// ============================================================================
// Scene 1: Bass Geometry (低音幾何)
// ============================================================================

// 確保 Scenes 對象存在
if (typeof window.Scenes === 'undefined') {
    window.Scenes = {};
}

window.Scenes.drawBassGeometry = function(bands, pitchHue, peakFlash, beatFlash) {
    push();
    
    if (peakFlash > 0.1) {
        push();
        resetMatrix();
        fill(0, 0, 100, peakFlash * 0.25);
        rect(-width/2, -height/2, width, height);
        pop();
    }
    
    rotateX(PI * 0.25);
    translate(0, -80, 0);
    
    let gridW = 50;
    let gridH = 30;
    let t = frameCount * 0.02;
    let beatBoost = 1 + beatFlash * 0.4;
    
    for (let x = -width/2; x <= width/2; x += gridW) {
        for (let y = -height/4; y <= height/2; y += gridH) {
            let dx = map(x, -width/2, width/2, -1, 1);
            let dy = map(y, -height/4, height/2, -1, 1);
            let n = noise(dx * 1.2 + t * 0.3, dy * 1.2, t * 0.2);
            let hVal = ((n - 0.5) * 100 + map(bands.low, 0, 255, -20, 220)) * beatBoost;
            
            push();
            translate(x, y, hVal * 0.7);
            
            let baseHue = PitchDetection.currentNoteIndex >= 0 ? pitchHue : map(bands.low, 0, 255, 200, 260);
            let hue = (baseHue + map(x, -width/2, width/2, -20, 20)) % 360;
            let saturation = map(bands.mid, 0, 255, 20, 80) + peakFlash * 15;
            let brightness = 80 + beatFlash * 15;
            
            fill(hue, saturation, brightness, 0.95);
            box(gridW * 0.7, gridH * 0.7, max(2, hVal * 0.6));
            pop();
        }
    }
    
    pop();
    
    // Top flare
    let peak = max(bands.low, bands.mid, bands.high);
    if (peak > 170 || peakFlash > 0.3) {
        push();
        translate(0, -height * 0.12, 0);
        rotateX(frameCount * 0.01);
        let flareHue = PitchDetection.currentNoteIndex >= 0 ? pitchHue : (map(peak, 0, 255, 200, 320) % 360);
        fill(flareHue, 80, 100, 0.12 + peakFlash * 0.1);
        sphere(width * 0.9, 48, 24);
        pop();
    }
};

