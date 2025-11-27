// scene-faraday.js
// Scene 4: Faraday Microbead Ripple (微珠法拉第波紋)
// 3D 粒子波紋場景，音調區域劃分，波紋疊加與緩衝。

if (typeof window.Scenes === 'undefined') {
    window.Scenes = {};
}

/**
 * 繪製 3D 聲波壓力場景。
 * @param {Array} faradayParticles - 粒子的陣列，3D 座標 (x, y, z)。
 * @param {object} bands - 頻率能量數據 {low, mid, high, vol}。
 * @param {object} pitchData - 音高數據 {currentNote, currentPitchIndex}。
 * @param {object} effects - 效果數據 {peakFlash, beatFlash, spectrum}。
 * @param {Array} ToneRipples - 12 個音調區域的波紋緩衝狀態。
 */
window.Scenes.drawFaradayMicrobeads = function(faradayParticles, bands, pitchData, effects, ToneRipples) {
    let low = bands.low, mid = bands.mid, high = bands.high, vol = bands.vol;
    
    // ------------------------------------------
    // 3D 視角設置 (相對於 Camera.update())
    // ------------------------------------------
    push();
    
    // 設置視角：俯視平面
    rotateX(PI * 0.4); 
    translate(0, 100, 0); // 將平面向下移動一點，以便看到高度
    
    // 1. 設置中心點 (X=0, Z=0)
    let centerX = 0;
    let centerZ = 0;

    // 2. 基礎波紋參數
    let rippleDensity = map(mid, 0, 255, 0.01, 0.03); // 中頻影響波紋密度
    
    // 12個音階的顏色映射
    const NOTE_COLORS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
    const NOTE_ANGLES = [];
    for (let i = 0; i < 12; i++) {
        NOTE_ANGLES.push((i / 12) * TWO_PI);
    }
    
    // ------------------------------------------
    // 繪製粒子微珠 (3D 核心循環)
    // ------------------------------------------
    for (let p of faradayParticles) {
        let x = p.pos.x;
        let z = p.pos.z;
        
        // 1. 幾何計算
        let distFromCenter = dist(x, z, centerX, centerZ); // 使用 XZ 平面距離
        let angle = atan2(z, x); // 使用 XZ 平面角度
        if (angle < 0) angle += TWO_PI;
        
        let noteRegion = floor((angle / TWO_PI) * 12);
        noteRegion = constrain(noteRegion, 0, 11);
        
        // 2. 波幅疊加計算 (核心)
        // 首先添加基礎漣漪（從中心不斷擴散，確保始終有波動）
        let baseRippleTime = frameCount * 0.05; // 基礎漣漪時間（加快速度）
        let baseRippleFreq = 0.025; // 基礎漣漪頻率
        // 多層基礎漣漪疊加，創造更明顯的波動（增大振幅）
        let baseRipple1 = sin(distFromCenter * baseRippleFreq - baseRippleTime) * 0.8; // 從 0.4 增加到 0.8
        let baseRipple2 = sin(distFromCenter * baseRippleFreq * 1.5 - baseRippleTime * 1.2) * 0.4; // 從 0.2 增加到 0.4
        let baseRipple3 = sin(distFromCenter * baseRippleFreq * 0.7 - baseRippleTime * 0.8) * 0.3; // 新增第三層
        let baseRipple = baseRipple1 + baseRipple2 + baseRipple3; // 基礎漣漪（更大更明顯）
        let totalAmplitudeInfluence = baseRipple; // 從基礎漣漪開始
        
        const MAX_TOTAL_AMP = 12 * 1.5 + 1.5; // 理論上所有波紋的最大振幅之和（包括基礎漣漪，增大以適應更大的基礎波動）
        
        // 疊加所有音調區域的漣漪
        ToneRipples.forEach((ripple, index) => {
            // 確保基礎振幅始終存在（即使很小）
            let effectiveAmplitude = ripple.amplitude || ripple.baseAmplitude || 0.2;
            
            // 降低閾值，讓所有漣漪都參與計算
            if (effectiveAmplitude > 0.0001) { 
                // 波紋運動: 距離 * 密度 - 漣漪時間
                let waveOffset = distFromCenter * rippleDensity - ripple.time;
                let wave = sin(waveOffset);
                
                // 角度影響力
                let regionAngle = NOTE_ANGLES[index];
                let angleDiff = abs(angle - regionAngle);
                if (angleDiff > PI) angleDiff = TWO_PI - angleDiff;
                
                let angleInfluence = 1.0 - (angleDiff / (PI / 6)); 
                angleInfluence = constrain(angleInfluence, 0, 1);
                
                // 區域影響: 交叉效果
                let areaInfluence = index === noteRegion ? 1.0 : 0.5; // 增加交叉影響
                let distanceDecay = 1.0 / (1.0 + distFromCenter * 0.0003); // 減少衰減
                
                let influence = wave * effectiveAmplitude * areaInfluence * angleInfluence * distanceDecay;
                totalAmplitudeInfluence += influence;
            }
        });
        
        // 3. 最終 Y 軸高度 (景深)
        // 將總體影響映射到 Y 軸高度（增加範圍，讓波動更明顯）
        let y = map(totalAmplitudeInfluence, -MAX_TOTAL_AMP * 0.8, MAX_TOTAL_AMP * 0.8, -80, 80);
        
        // 4. 顏色和亮度 (灰階為主，音調標記為輔)
        let finalBrightness = map(totalAmplitudeInfluence, -MAX_TOTAL_AMP, MAX_TOTAL_AMP, 40, 90);
        
        let saturation = 0;
        let hue = 0;
        
        if (ToneRipples[noteRegion].amplitude > 0.05) {
             // 只有音調被激發時才顯示顏色
             hue = NOTE_COLORS[noteRegion]; 
             saturation = map(ToneRipples[noteRegion].amplitude, 0.05, 1.0, 30, 80); 
        }
        
        fill(hue, saturation, finalBrightness, 1.0);
        
        // 繪製粒子
        push();
        translate(x, y, z); // 設置粒子 X, Y(高度), Z 位置
        sphere(p.size * map(vol, 0, 0.3, 1, 2)); // 尺寸受音量影響
        pop();
    }
    
    // ------------------------------------------
    // 繪製中心光源 (保持對齊)
    // ------------------------------------------
    let lightHue = PitchDetection.currentNoteIndex >= 0 
        ? NOTE_COLORS[PitchDetection.currentNoteIndex]
        : 220;
    
    fill(lightHue, 80, 100, 0.4);
    noStroke();
    
    push();
    translate(0, 0, 0); // 確保光源在平面中心 (Y=0)
    sphere(20); 
    pop();
    
    pop(); // 結束 3D 視角設置
};