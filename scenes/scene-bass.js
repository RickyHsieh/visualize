// File: scenes/scene-bass.js
// ============================================================================
// Scene 1: Bass Geometry V2 (低音機械矩陣 - 動態旋轉與故障風)
// ============================================================================

if (typeof window.Scenes === 'undefined') {
    window.Scenes = {};
}

// 專屬於此場景的浮動粒子狀態
window.Scenes.bassParticles = [];

window.Scenes.drawBassGeometry = function(bands, pitchHue, peakFlash, beatFlash) {
    push();
    
    // ------------------------------------------
    // 1. 鏡頭震動與設置 (Camera Shake on Beat)
    // ------------------------------------------
    let shake = beatFlash > 0.5 ? random(-3, 3) : 0;
    
    rotateX(PI * 0.28 + map(mouseY, 0, height, -0.1, 0.1)); // 允許滑鼠微調視角
    translate(0 + shake, -50 + shake, -100); // 稍微後退一點看全景
    
    // ------------------------------------------
    // 2. 燈光與氛圍 (Lighting)
    // ------------------------------------------
    // 根據節拍改變環境光亮度
    ambientLight(40 + beatFlash * 60); 
    
    // 雙色燈光系統：一邊冷色，一邊暖色，增加層次
    pointLight(pitchHue, 80, 100, -300, -200, 200); // 跟隨音高顏色的主光
    pointLight(200, 50, 80, 300, 100, 200);   // 補光
    
    // ------------------------------------------
    // 3. 能量浮粒系統 (Rising Floating Cubes)
    // ------------------------------------------
    // 當低音強烈時，生成新的浮動粒子
    if (bands.low > 180 && random(1) < 0.4) {
        window.Scenes.bassParticles.push({
            x: random(-width/2, width/2),
            y: random(100, 300), // 從下方生成
            z: random(-200, 200),
            size: random(5, 15),
            speed: random(3, 8),
            life: 255
        });
    }
    
    // 繪製並更新粒子
    for (let i = window.Scenes.bassParticles.length - 1; i >= 0; i--) {
        let p = window.Scenes.bassParticles[i];
        p.y -= p.speed; // 向上飄
        p.life -= 4;    // 漸漸消失
        
        if (p.life <= 0) {
            window.Scenes.bassParticles.splice(i, 1);
            continue;
        }
        
        push();
        translate(p.x, p.y, p.z);
        noStroke();
        // 粒子顏色跟隨高頻閃爍
        fill(pitchHue, 60, 100, p.life / 255);
        box(p.size);
        pop();
    }
    
    // ------------------------------------------
    // 4. 主幾何矩陣 (The Kinetic Grid)
    // ------------------------------------------
    
    let gridW = 55;
    let gridH = 55;
    let t = frameCount * 0.03;
    let lowEnergy = bands.low / 255.0; // 0.0 ~ 1.0
    
    // 決定是否進入「故障線框模式」 (Glitch Mode)
    // 當節拍非常強時，切換為線框，視覺更通透
    let isWireframeMode = beatFlash > 0.6;
    
    for (let x = -width/1.8; x <= width/1.8; x += gridW) {
        for (let y = -height/2; y <= height/2; y += gridH) {
            
            // 計算與中心的距離 (用於波浪延遲)
            let distFromCenter = dist(x, y, 0, 0);
            
            // 噪音計算：加入距離因素，讓波浪從中心擴散
            let noiseScale = 0.004;
            let n = noise(x * noiseScale + t, y * noiseScale, t * 0.5);
            
            // 高度計算：低頻推動高度，且距離中心越近跳得越高
            let amp = map(bands.low, 0, 255, 10, 350);
            let hVal = (n - 0.3) * amp * (1.5 - distFromCenter/1000); 
            
            push();
            translate(x, y, hVal * 0.5);
            
            // --- 【關鍵升級】動態旋轉 ---
            // 根據方塊的高度和低頻能量進行旋轉
            // 越高的方塊轉越快，創造機械扭動感
            let rotAmount = hVal * 0.005 * lowEnergy; 
            rotateX(rotAmount);
            rotateY(rotAmount * 1.5);
            
            // --- 材質與顏色邏輯 ---
            let baseHue = PitchDetection.currentNoteIndex >= 0 ? pitchHue : 220;
            let hue = (baseHue + map(distFromCenter, 0, 800, 0, 60)) % 360;
            
            if (isWireframeMode) {
                // [故障模式]：只畫線框，發光
                noFill();
                strokeWeight(2);
                stroke(hue, 90, 100); // 高亮線條
            } else {
                // [實體模式]：金屬質感
                noStroke();
                // 亮度隨高度變化，越高越亮
                let br = map(hVal, -100, 200, 40, 100);
                // 金屬反光材質
                specularMaterial(hue, 70, br);
                shininess(50);
            }
            
            // 根據音量微調方塊大小 (鼓點時變大)
            let boxScale = 1.0;
            if (beatFlash > 0.2) boxScale = 1.0 + beatFlash * 0.3;
            
            // 繪製
            box(gridW * 0.85 * boxScale, gridH * 0.85 * boxScale, max(10, abs(hVal)));
            
            pop();
        }
    }
    
    pop();
};