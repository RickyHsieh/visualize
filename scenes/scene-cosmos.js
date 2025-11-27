// ============================================================================
// Scene 0: Cosmos Particles (宇宙粒子)
// ============================================================================

// 確保 Scenes 對象存在
if (typeof window.Scenes === 'undefined') {
    window.Scenes = {};
}

window.Scenes.drawCosmosParticles = function(bands, pitchHue, peakFlash, beatFlash) {
    push();
    
    // Peak flash overlay
    if (peakFlash > 0.1) {
        push();
        resetMatrix();
        fill(0, 0, 100, peakFlash * 0.3);
        rect(-width/2, -height/2, width, height);
        pop();
    }
    
    // Background stars
    let starHue = PitchDetection.currentNoteIndex >= 0 ? pitchHue : 210;
    for (let i = 0; i < 150; i++) {
        push();
        let x = ((i * 83) % width) - width/2;
        let y = sin(i * 0.13 + frameCount * 0.002) * 120 - 80;
        let z = -800 + (i % 10) * 20;
        translate(x, y, z);
        fill(starHue, 10, map(i % 10, 0, 9, 30, 80), 0.8);
        sphere(1.1);
        pop();
    }
    
    // Particle field
    let baseAmp = map(bands.low, 0, 255, 0.3, 2.2);
    if (beatFlash > 0.3) {
        baseAmp *= (1 + beatFlash * 0.5);
    }
    
    for (let i = 0; i < State.particles.length; i++) {
        let p = State.particles[i];
        let n = noise(p.pos.x * 0.0008, p.pos.y * 0.0009, frameCount * 0.002);
        let wave = map(n, 0, 1, -40, 40) * baseAmp;
        let kick = map(bands.low, 0, 255, 0, 180) * (sin((frameCount + i) * 0.02 + i * 0.001));
        let z = p.pos.z + wave + kick * 0.2;
        
        push();
        translate(p.pos.x * 0.6, p.pos.y * 0.45 + height * 0.12, z);
        
        let baseHue = PitchDetection.currentNoteIndex >= 0 ? pitchHue : p.hue;
        let hue = (baseHue + map(bands.high, 0, 255, -40, 40)) % 360;
        let brightness = map(bands.low + bands.mid, 0, 510, 30, 100) + peakFlash * 30;
        let saturation = 70 + beatFlash * 20;
        
        fill(hue, saturation, brightness, 0.9);
        sphere(p.size * map(bands.vol, 0, 0.2, 0.8, 3.2) * (1 + beatFlash * 0.3));
        pop();
    }
    
    // Floating ribbons
    let midAmt = map(bands.mid, 0, 255, 0, 1.6);
    for (let r = -2; r <= 2; r++) {
        push();
        let ribbonHue = PitchDetection.currentNoteIndex >= 0 
            ? (pitchHue + r * 15) % 360 
            : (240 + r * 10) % 360;
        fill(ribbonHue, 80, 90, 0.2 + beatFlash * 0.2);
        translate(0, r * 40, -200 + r * 20);
        rotateY(frameCount * 0.002 * (r+3));
        beginShape();
        for (let x = -width/2; x <= width/2; x += 20) {
            let y = sin(x * 0.01 + frameCount * 0.02 * (r+1)) * 40 * midAmt - 60;
            vertex(x, y, map(x, -width/2, width/2, -80, 80));
        }
        endShape();
        pop();
    }
    
    pop();
};

