// File: scenes/scene-bass.js
// ============================================================================
// Scene 1: Bass Geometry (低音幾何) - 優化版
// ============================================================================

// 確保 Scenes 對象存在
if (typeof window.Scenes === 'undefined') {
    window.Scenes = {};
}

window.Scenes.drawBassGeometry = function(bands, pitchHue, peakFlash, beatFlash) {
    push();
    
    // ------------------------------------------
    // 1. 頂部瞬時閃光 (Peak Flash Overlay)
    // ------------------------------------------
    if (peakFlash > 0.1) {
        push();
        resetMatrix();
        fill(0, 0, 100, peakFlash * 0.35); // 白色閃光
        rect(-width/2, -height/2, width, height);
        pop();
    }
    
    // 設置基礎旋轉和視角
    rotateX(PI * 0.25);
    translate(0, -80, 0);
    
    // ------------------------------------------
    // 2. 光照和材質設定 (增強立體感)
    // ------------------------------------------
    
    // 環境光：提供基礎亮度 (較低)
    ambientLight(40); 
    
    // 主定向光：提供主要的立體感和陰影方向 (冷色調)
    directionalLight(150, 180, 200, -0.5, -0.8, -0.2); 
    
    // 輔助點光：位於近處，提供強烈的邊緣高光 (暖色調)
    pointLight(255, 200, 150, 0, -200, 300);
    
    // ------------------------------------------
    // 3. 幾何網格生成
    // ------------------------------------------
    
    let gridW = 50;
    let gridH = 30;
    let t = frameCount * 0.02;
    let beatBoost = 1 + beatFlash * 0.5; // 節拍增幅
    let lowEnergy = bands.low / 255.0; // 低頻能量 (0-1)
    
    // 迭代生成網格方體
    for (let x = -width/2; x <= width/2; x += gridW) {
        for (let y = -height/4; y <= height/2; y += gridH) {
            
            let dx = map(x, -width/2, width/2, -1, 1);
            let dy = map(y, -height/4, height/2, -1, 1);
            
            // 高度計算：噪音基線 + 低頻衝擊
            let n = noise(dx * 1.2 + t * 0.3, dy * 1.2, t * 0.2);
            let hVal = ((n - 0.5) * 80 + map(bands.low, 0, 255, 0, 250)) * beatBoost; // 調整基線噪音影響
            
            push();
            translate(x, y, hVal * 0.7);
            
            // --- 材質與顏色 ---
            
            // 基礎色相：音高優先，低頻次之
            let baseHue = PitchDetection.currentNoteIndex >= 0 
                ? pitchHue 
                : map(bands.low, 0, 255, 200, 260); // 冷色調
            
            // 色相動態：隨 X 軸和高頻輕微變化
            let hue = (baseHue + map(x, -width/2, width/2, -15, 15)) % 360;
            let saturation = map(bands.mid, 0, 255, 40, 90) + beatFlash * 15; // 中頻/節拍控制飽和度
            let brightness = 85 + lowEnergy * 15; // 亮度受低頻影響
            
            // 設置高光材質 (Shininess 越大，高光越集中，金屬感越強)
            shininess(60 + lowEnergy * 80); 
            specularMaterial(hue, saturation, brightness, 0.95);
            
            // 邊框線條：使用亮色或純白色，增強視覺區分度
            stroke(0, 0, 100, 0.3); // 柔和的白線
            strokeWeight(1.0);
            
            // 繪製方體
            box(gridW * 0.8, gridH * 0.8, max(2, hVal * 0.6));
            pop();
        }
    }
    
    pop();
    
    // ------------------------------------------
    // 4. 頂部脈衝光暈 (Top Flare)
    // ------------------------------------------
    let peak = max(bands.low, bands.mid, bands.high);
    if (peak > 170 || peakFlash > 0.3) {
        push();
        // 確保光暈不受主場景旋轉的影響，但位置要對齊中心
        resetMatrix();
        translate(0, -height * 0.12, 0); // 放在畫面頂部附近
        
        rotateX(frameCount * 0.01);
        
        let flareHue = PitchDetection.currentNoteIndex >= 0 
            ? pitchHue 
            : (map(peak, 0, 255, 200, 320) % 360);
            
        // 使用 ADD 模式讓光暈疊加更強烈
        blendMode(ADD); 
        fill(flareHue, 80, 100, 0.15 + peakFlash * 0.15); // 透明度受 peakFlash 影響
        sphere(width * 0.8, 48, 24);
        blendMode(BLEND);
        
        pop();
    }
};