// scene-faraday.js
// Scene 4: Faraday Raindrops (Hz Color + Volume Amp + Flat Default + Big Voxels)

if (typeof window.Scenes === 'undefined') {
    window.Scenes = {};
}

// 狀態管理
window.Scenes.faradayRipplesState = {
    ripples: [],       // 存儲波紋
    lastSpawnTime: 0,  // 生成冷卻
    prevEnergy: 0,     // 能量偵測
    gridSize: 800      // 需與 index.js 一致
};

window.Scenes.drawFaradayMicrobeads = function(faradayParticles, bands, pitchData, effects) {
    // 安全檢查
    if (!faradayParticles || faradayParticles.length === 0) return;

    const state = window.Scenes.faradayRipplesState;
    const time = millis();

    // ------------------------------------------
    // 1. 觸發邏輯：聲音生成帶有顏色的漣漪
    // ------------------------------------------
    
    // 計算能量突波
    let currentEnergy = (bands.low || 0) + (bands.mid || 0) + (bands.high || 0);
    let energyDiff = currentEnergy - state.prevEnergy;
    state.prevEnergy = currentEnergy;

    // 觸發條件
    let isTransients = energyDiff > 10; 
    let isSustained = bands.vol > 0.02; 
    let cooldown = 50; 

    if (time - state.lastSpawnTime > cooldown) {
        if (isTransients || isSustained || effects.beatFlash > 0.1) {
            
            // --- 位置隨機 ---
            let halfGrid = state.gridSize / 2;
            let rx = random(-halfGrid, halfGrid);
            let rz = random(-halfGrid, halfGrid);
            
            // --- 顏色 (Hz -> Hue) ---
            // 這是關鍵：生成的瞬間決定這個波紋的顏色
            let targetHue = 200; // 預設
            let freq = pitchData.currentFrequency;
            
            if (freq > 50) {
                // 使用 Log 對數映射，符合人耳對音高的感知
                // 50Hz(紅) -> 1000Hz(紫)
                targetHue = map(Math.log(freq), Math.log(50), Math.log(1000), 0, 280);
                targetHue = constrain(targetHue, 0, 360);
            } else {
                // 若無音高，隨機產生冷色調
                targetHue = random(180, 260);
            }

            // --- 振幅 (Volume -> Amplitude) ---
            // 聲音越大，波浪越高
            let strength = map(bands.vol, 0, 0.5, 1.0, 5.0);
            strength = constrain(strength, 1.0, 6.0); 

            state.ripples.push({
                x: rx,
                z: rz,
                startTime: time,
                // 波高設定
                amplitude: 70 * strength, 
                frequency: map(bands.high || 0, 0, 255, 0.025, 0.045),
                speed: 0.35,     
                decay: 0.0025,   
                lifespan: 3000,
                hue: targetHue   // 記住這個波紋的顏色
            });
            
            state.lastSpawnTime = time;
        }
    }

    // 清理過期波紋
    for (let i = state.ripples.length - 1; i >= 0; i--) {
        if (time - state.ripples[i].startTime > state.ripples[i].lifespan) {
            state.ripples.splice(i, 1);
        }
    }

    // ------------------------------------------
    // 2. 物理計算與渲染
    // ------------------------------------------
    push();
    rotateX(PI * 0.35); 
    translate(0, 0, 0); 
    
    noStroke();

    // 優化：只計算最新的 12 個波紋
    let activeRipples = state.ripples.slice(-12);
    let activeCount = activeRipples.length;

    for (let p of faradayParticles) {
        let x = p.pos.x;
        let z = p.pos.z;
        
        let totalY = 0;           // 疊加後的高度
        let maxInfluence = 0;     // 用於判定顏色權重
        let activeColorH = 220;   // 預設顏色 (靜止時的顏色)

        // --- 波動疊加迴圈 ---
        for (let i = 0; i < activeCount; i++) {
            let r = activeRipples[i];
            
            // 距離計算 (平方優化)
            let dx = x - r.x;
            let dz = z - r.z;
            let distSq = dx*dx + dz*dz;
            
            if (distSq < 1440000) { // 半徑 1200 內
                let d = Math.sqrt(distSq);
                let age = time - r.startTime;
                let waveRadius = age * r.speed;

                // 波紋有效範圍
                if (d < waveRadius + 100 && d > waveRadius - 600) {
                    let distanceDecay = 1 / (1 + d * 0.001); 
                    let timeDecay = Math.exp(-age * r.decay);
                    
                    // 下壓波形 (-cos)
                    let phase = d * r.frequency - age * 0.015;
                    let waveVal = -Math.cos(phase); 
                    
                    let currentAmp = waveVal * r.amplitude * timeDecay * distanceDecay;
                    
                    totalY += currentAmp;

                    // 顏色競爭：誰的振幅大，這個粒子就顯示誰的顏色
                    let influence = Math.abs(currentAmp);
                    if (influence > maxInfluence) {
                        maxInfluence = influence;
                        activeColorH = r.hue;
                    }
                }
            }
        }

        // 【關鍵】：移除了 noise 噪音，所以沒聲音時 totalY 會是絕對的 0 (平整)

        // --- 繪製粒子 ---
        
        let displayY = constrain(totalY, -350, 350);
        let displacement = Math.abs(displayY);
        
        // 透明度：只有動起來的時候才變得不透明，靜止時稍微透明一點更有質感
        let alpha = map(displacement, 0, 50, 100, 255);
        
        // 亮度：根據高度打光
        let br = map(displayY, -150, 150, 40, 100);
        
        // 飽和度：平靜時低飽和(灰)，動起來變鮮豔
        let sat = map(displacement, 0, 30, 0, 90);
        
        // 顏色邏輯：
        // 如果有波紋影響 (maxInfluence > 1)，顯示波紋顏色
        // 否則顯示預設的深藍灰色
        let hue = maxInfluence > 1 ? activeColorH : 215;

        fill(hue, sat, br, alpha / 255);
        
        push();
        translate(x, displayY, z);
        
        // 顆粒大小：靜止時 10，波動時變大到 18 (大顆粒設定)
        let pSize = 10.0 + map(displacement, 0, 150, 0, 8.0);
        
        box(pSize); 
        pop();
    }
    
    pop();
};