// ============================================================================
// Scene: Static Stars (靜態星空背景)
// ============================================================================

// 確保 Scenes 對象存在
if (typeof window.Scenes === 'undefined') {
    window.Scenes = {};
}

window.Scenes.drawStaticStars = function() {
    push();
    translate(0, 0, -400);
    for (let i = 0; i < 300; i++) {
        let x = (i * 37) % (width) - width/2;
        let y = (noise(i * 0.1, frameCount * 0.002) - 0.5) * height * 0.6;
        let z = sin(i * 0.3 + frameCount * 0.01) * 400 - 400;
        push();
        translate(x, y, z);
        fill(220, 20, 100, 0.9);
        sphere(1.2);
        pop();
    }
    pop();
};

