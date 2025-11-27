// ============================================================================
// Scene 5: Neon Bouncing Rings (10倍增益 + 1~2次彈跳版)
// ============================================================================

if (typeof window.Scenes === 'undefined') {
    window.Scenes = {};
}

// --- 狀態管理與初始化 ---
if (typeof window.Scenes.activeRings === 'undefined') window.Scenes.activeRings = [];
if (typeof window.Scenes.groundImpacts === 'undefined') window.Scenes.groundImpacts = [];
if (typeof window.Scenes.lastRingSpawnTime === 'undefined') window.Scenes.lastRingSpawnTime = 0;
if (typeof window.Scenes.lastSoundTime === 'undefined') window.Scenes.lastSoundTime = 0;

// 記錄是否已經執行過開場掉落
if (typeof window.Scenes.hasInitialDrop === 'undefined') window.Scenes.hasInitialDrop = false;

// --- 效能控管參數 ---
const MAX_ACTIVE_RINGS = 50;   
const MIN_SPAWN_INTERVAL = 80; 
const MAX_GROUND_IMPACTS = 150; 

// 定義圓環粒子類別
class RingParticle {
    constructor(x, y, bands, pitchHue, ampVol) { 
        const low = bands?.low || 0;
        const mid = bands?.mid || 0; 

        this.pos = createVector(x, y, 0); 
        
        // 低空快墜速度
        this.vel = createVector(random(-3, 3), random(5, 12), random(-3, 3)); 
        
        // 重力加速度
        this.acc = createVector(0, 0.3 + map(low, 0, 255, 0, 0.4), 0); 

        // 圓的大小
        let baseSize = map(mid, 0, 255, 25, 75);
        if (ampVol > 0.1) baseSize += ampVol * 5; 
        this.radius = constrain(baseSize, 25, 80);

        this.floorLevel = 260; 

        this.cometAngle = -PI / 2;        
        this.cometSpeed = 0.35; 
        this.cometActive = true;          
        
        this.baseHue = (typeof pitchHue === 'number' && !isNaN(pitchHue)) ? pitchHue : random(0, 360);
        
        this.bounceCount = 0;
        
        // 彈跳次數 1~2 次
        this.requiredBounces = floor(random(1, 3)); 
        
        this.lastImpactFrame = -100;
        
        this.isDead = false;              
        this.bounced = false;             
        this.opacity = 255;               
    }

    update(bands) {
        this.vel.add(this.acc);
        this.pos.add(this.vel);

        // 地板碰撞
        if (this.pos.y + this.radius > this.floorLevel) {
            this.pos.y = this.floorLevel - this.radius; 
            
            this.vel.y *= -0.6; 
            
            this.bounceCount++;
            
            this.triggerImpactSound(abs(this.vel.y));
            
            window.Scenes.groundImpacts.push({
                x: this.pos.x,
                z: this.pos.z,
                life: 255, 
                hue: this.baseHue, 
                radius: this.radius * 1.1
            });

            if (this.bounceCount === 1) {
                this.vel.x = random(-4, 4);
                this.vel.z = random(-6, 6);
            }

            if (this.bounceCount >= this.requiredBounces) {
                this.bounced = true;
            }
        }

        if (this.cometActive) {
            this.cometAngle += this.cometSpeed;
        }

        if (this.bounced) {
            this.opacity -= 15; 
            if (this.opacity <= 0) {
                this.isDead = true;
            }
        }
        
        if (this.pos.y > 1000) this.isDead = true;
    }

    triggerImpactSound(impactSpeed) {
        if (typeof window === 'undefined' || !window.polySynth) return;
        
        if (impactSpeed < 1.0) return;
        if (frameCount - this.lastImpactFrame < 8) return;
        
        if (millis() - window.Scenes.lastSoundTime < 40) return;

        this.lastImpactFrame = frameCount;
        window.Scenes.lastSoundTime = millis();
        
        const noteVal = map(this.radius, 25, 90, 80, 50);
        let velocity = map(impactSpeed, 0, 20, 0.1, 0.6); 
        
        try {
            window.polySynth.play(midiToFreq(noteVal), velocity, 0, 0.15);
        } catch (e) {
            // ignore
        }
    }

    draw() {
        push();
        translate(this.pos.x, this.pos.y, this.pos.z);

        // 圓框
        push();
        colorMode(HSB, 360, 100, 100, 1);
        noFill();
        stroke(this.baseHue, 90, 100, 0.8 * (this.opacity/255));
        strokeWeight(2.5); 
        ellipse(0, 0, this.radius * 2);
        pop();

        // 彗星
        if (this.opacity > 0) {
            let tailLength = 15; 
            push();
            colorMode(HSB, 360, 100, 100, 1);
            for (let i = 0; i < tailLength; i++) {
                let theta = this.cometAngle - (i * 0.15);
                let alpha = map(i, 0, tailLength, 255, 0) * (this.opacity / 255);
                let sw = map(i, 0, tailLength, 6, 0.5);
                
                let px = cos(theta) * this.radius;
                let py = sin(theta) * this.radius;
                let prevTheta = this.cometAngle - ((i - 1) * 0.15);
                let ppx = cos(prevTheta) * this.radius;
                let ppy = sin(prevTheta) * this.radius;

                stroke(this.baseHue, 70, 100, alpha / 255); 
                strokeWeight(sw);

                if (i > 0) {
                    line(ppx, ppy, 0, px, py, 0);
                } else {
                    point(px, py, 0);
                }
            }
            pop();
        }
        pop();
    }
}

window.Scenes.drawNeonBouncingRings = function(bands, pitchHue, peakFlash, beatFlash) {
    push();
    translate(0, -100, -300); 

    let currentTime = millis();

    // ==========================================
    // 軟體增益 (調整為 10 倍)
    // ==========================================
    // 0.00005 * 10 = 0.0005 (雜訊)
    // 0.002 * 10 = 0.02 (達到觸發門檻)
    let amplifiedVol = bands.vol * 10; 

    // ==========================================
    // 開場預設掉落
    // ==========================================
    if (!window.Scenes.hasInitialDrop) {
        let dummyBands = { low: 100, mid: 140, high: 100, vol: 0.5 };
        for (let i = 0; i < 6; i++) {
            let startX = random(-350, 350);
            let startY = random(-200, -50); 
            let randomHue = random(0, 360);
            window.Scenes.activeRings.push(new RingParticle(startX, startY, dummyBands, randomHue, 0.5));
        }
        window.Scenes.hasInitialDrop = true;
    }

    // ==========================================
    // 聲音觸發生成邏輯
    // ==========================================
    
    // 門檻維持 0.02，因為增益變大了，相對來說更容易觸發
    let hasSignal = amplifiedVol > 0.02; 
    
    if (!window.Scenes.lastRingSpawnTime) window.Scenes.lastRingSpawnTime = 0;
    let timeSinceLast = currentTime - window.Scenes.lastRingSpawnTime;
    let canSpawn = timeSinceLast > MIN_SPAWN_INTERVAL;

    if (hasSignal && canSpawn) {
        if (window.Scenes.activeRings.length >= MAX_ACTIVE_RINGS) {
            window.Scenes.activeRings.shift(); 
        }
        let startX = random(-400, 400);
        let startY = random(-150, 0); 
        let safeHue = (typeof pitchHue === 'number') ? pitchHue : random(0, 360);
        
        window.Scenes.activeRings.push(new RingParticle(startX, startY, bands, safeHue, amplifiedVol));
        window.Scenes.lastRingSpawnTime = currentTime;
        
        if (amplifiedVol > 0.3) {
             window.Scenes.activeRings.push(new RingParticle(startX + random(-60,60), startY + random(-60,60), bands, safeHue, amplifiedVol));
             window.Scenes.lastRingSpawnTime -= 15; 
        }
    }
    // ==========================================

    // 更新並繪製
    for (let i = window.Scenes.activeRings.length - 1; i >= 0; i--) {
        let p = window.Scenes.activeRings[i];
        p.update(bands);
        p.draw();

        if (p.isDead) {
            window.Scenes.activeRings.splice(i, 1);
        }
    }

    // 地板網格 (螢光綠)
    push();
    colorMode(HSB, 360, 100, 100, 1);
    stroke(110, 100, 100, 0.6); 
    strokeWeight(1.5);
    translate(0, 260, 0); 
    for (let i = -600; i <= 600; i += 50) {
        line(i, 0, -600, i, 0, 600);
        line(-600, 0, i, 600, 0, i);
    }
    pop(); 
    
    // 撞擊光圈
    colorMode(HSB, 360, 100, 100, 1);
    for (let i = window.Scenes.groundImpacts.length - 1; i >= 0; i--) {
        let hit = window.Scenes.groundImpacts[i];
        let alpha = hit.life / 255;
        if (alpha <= 0) {
            window.Scenes.groundImpacts.splice(i, 1);
            continue;
        }
        push();
        
        translate(hit.x, 260, hit.z); 
        
        rotateX(HALF_PI);
        noFill();
        stroke(hit.hue, 80, 100, alpha);
        strokeWeight(3 * alpha); 
        ellipse(0, 0, hit.radius * 2);
        pop();
        
        hit.life -= 12; 
        hit.radius += 6; 
    }
    while (window.Scenes.groundImpacts.length > MAX_GROUND_IMPACTS) {
        window.Scenes.groundImpacts.shift();
    }
    colorMode(HSB, 360, 100, 100, 1);
    
    pop();
};