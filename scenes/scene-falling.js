// ============================================================================
// Scene 3: Neon Bouncing Rings (螢光彗星彈跳環)
// ============================================================================

// 初始化場景狀態存儲 (如果尚未存在)
if (typeof window.Scenes === 'undefined') {
    window.Scenes = {};
}

// 用來存儲所有活動中的圓環與地板撞擊效果
window.Scenes.activeRings = window.Scenes.activeRings || [];
window.Scenes.groundImpacts = window.Scenes.groundImpacts || [];
const MAX_ACTIVE_RINGS = 120;
const MAX_GROUND_IMPACTS = 200;

const RING_NOTE_HIGH = 78;
const RING_NOTE_LOW = 54;

// 定義圓環粒子類別
class RingParticle {
    constructor(x, y, bands, pitchHue) {
        const low = bands?.low || 0;
        const mid = bands?.mid || 0;
        const high = bands?.high || 0;

        this.pos = createVector(x, y, 0); // 位置
        this.vel = createVector(random(-1, 1), random(0, 2), random(-2, 2)); // 速度
        this.acc = createVector(0, 0.18 + map(low, 0, 255, 0, 0.4), 0); // 重力加速度依低頻調整

        this.radius = map(mid, 0, 255, 25, 85);     // 圓的大小隨中頻改變
        this.floorLevel = 260;            // 隱形地板的高度 (相對於中心)

        // 彗星動畫屬性
        this.cometAngle = -PI / 2;        // 彗星起始角度
        this.cometSpeed = map(high, 0, 255, 0.2, 0.5); // 高頻越強繞行越快
        this.cometActive = true;          // 彗星是否還在繞行
        this.baseHue = typeof pitchHue === 'number'
            ? pitchHue
            : map(high, 0, 255, 90, 150);  // 依音調/高頻變換主色
        this.bounceCount = 0;
        this.requiredBounces = floor(random(1, 4));
        this.lastImpactFrame = -100;
        
        // 生命週期屬性
        this.isDead = false;              // 是否該被移除
        this.bounced = false;             // 是否達成消失條件
        this.opacity = 255;               // 透明度
    }

    update(bands) {
        const low = bands?.low || 0;
        // 讓重力與阻尼隨低頻調整
        this.acc.y = 0.18 + map(low, 0, 255, 0.05, 0.35);

        // 1. 物理模擬
        this.vel.add(this.acc);
        this.pos.add(this.vel);

        // 2. 地板碰撞偵測
        if (this.pos.y + this.radius > this.floorLevel) {
            this.pos.y = this.floorLevel - this.radius; // 修正位置避免卡住
            this.vel.y *= -0.6; // 彈跳係數 (反轉速度並消耗能量)
            this.bounceCount++;
            this.triggerImpactSound(abs(this.vel.y));
            window.Scenes.groundImpacts.push({
                x: this.pos.x,
                z: this.pos.z,
                life: 220,
                radius: this.radius * 1.3
            });

            // 標記已經彈跳，並給予一點隨機的水平偏轉讓畫面更自然
            if (this.bounceCount === 1) {
                this.vel.x = random(-2, 2);
                this.vel.z = random(-5, 5);
            }

            if (this.bounceCount >= this.requiredBounces) {
                this.bounced = true;
            }
        }

        // 3. 彗星繞行邏輯
        if (this.cometActive) {
            this.cometAngle += this.cometSpeed;
            // 如果繞了一圈 (或者兩圈，看視覺效果)，就停止彗星或讓它淡出
            // 這裡設定為一直繞行直到物件消失，或者你可以設定繞行 > TWO_PI * 2 就停止
            if (this.cometAngle > TWO_PI * 1.5 && !this.bounced) {
                // 選擇性邏輯：繞完一圈就不繞了？目前保留繼續繞行
            }
        }

        // 4. 消失邏輯：彈跳過後，當速度變慢或透明度變低時消失
        if (this.bounced) {
            this.opacity -= 8; // 彈跳後漸漸消失
            // 如果掉落出界或完全透明
            if (this.opacity <= 0) {
                this.isDead = true;
            }
        }
    }

    triggerImpactSound(impactSpeed) {
        if (typeof window === 'undefined' || !window.polySynth) return;
        if (impactSpeed < 1.2) return;
        if (frameCount - this.lastImpactFrame < 5) return;
        this.lastImpactFrame = frameCount;
        
        const clampedRadius = constrain(this.radius, 25, 85);
        const note = map(clampedRadius, 25, 85, RING_NOTE_HIGH, RING_NOTE_LOW);
        let velocity = map(impactSpeed, 0, 18, 0.08, 0.6);
        velocity = constrain(velocity, 0.08, 0.65);
        const freq = midiToFreq(note + random(-0.5, 0.5));
        window.polySynth.play(freq, velocity, 0, 0.25);
    }

    draw() {
        push();
        translate(this.pos.x, this.pos.y, this.pos.z);

        // --- A. 繪製基礎圓環（具體外框） ---
        push();
        colorMode(HSB, 360, 100, 100, 1);
        noFill();
        stroke(this.baseHue, 80, 90, 0.65 * (this.opacity/255));
        strokeWeight(2);
        ellipse(0, 0, this.radius * 2);
        pop();

        // --- B. 繪製螢光綠彗星 ---
        if (this.opacity > 0) {
            let tailLength = 20; // 彗星尾巴長度 (段數)

            push();
            colorMode(HSB, 360, 100, 100, 1);

            for (let i = 0; i < tailLength; i++) {
                // 計算每一段尾巴的角度 (逆時針推算回去)
                let theta = this.cometAngle - (i * 0.1);

                // 計算透明度：頭部最亮，尾部透明
                let alpha = map(i, 0, tailLength, 255, 0) * (this.opacity / 255);

                // 計算粗細：頭部粗，尾部細
                let sw = map(i, 0, tailLength, 6, 0.5);

                // 計算位置
                let px = cos(theta) * this.radius;
                let py = sin(theta) * this.radius;

                // 為了讓線段連貫，計算上一點的位置
                let prevTheta = this.cometAngle - ((i - 1) * 0.1);
                let ppx = cos(prevTheta) * this.radius;
                let ppy = sin(prevTheta) * this.radius;

                // 繪製光暈感 (多層疊加)
                stroke(this.baseHue, 95, 100, alpha / 255);
                strokeWeight(sw);

                if (i > 0) {
                    line(ppx, ppy, 0, px, py, 0);
                } else {
                    point(px, py, 0); // 頭部
                }
            }
            pop();
        }
        pop();
    }
}

window.Scenes.drawNeonBouncingRings = function(bands, pitchHue, peakFlash, beatFlash) {
    // 1. 設定場景環境
    // 注意：這裡不使用 background(0)，因為主程式通常會處理。
    // 如果需要殘影效果，可以在這裡加一層半透明黑底。

    // 將座標系移動到螢幕中心稍微上方，方便看掉落
    push();
    translate(0, -100, -300);

    // 2. 音頻觸發邏輯 (生成新圓環)
    // 限制：音量夠大 且 隨機機率 (避免一次生成太多)
    let spawnChance = bands.vol > 0.08
        ? map(bands.vol, 0.08, 0.5, 0.02, 0.65)
        : 0;
    spawnChance = constrain(spawnChance, 0, 0.7);
    if (random(1) < spawnChance && window.Scenes.activeRings.length < MAX_ACTIVE_RINGS) {
        // 根據音量大小決定生成數量，大聲時可能一次噴多顆
        let count = bands.vol > 0.35 ? 2 : 1;
        count = min(count, MAX_ACTIVE_RINGS - window.Scenes.activeRings.length);

        for(let n=0; n<count; n++) {
            // 隨機 X 位置 (-400 到 400)
            let startX = random(-400, 400);
            // 初始 Y 位置 (螢幕上方)
            let startY = -400 + random(-50, 50);

            window.Scenes.activeRings.push(new RingParticle(startX, startY, bands, pitchHue));
        }
    }

    // 3. 更新並繪製所有圓環
    // 使用倒敘迴圈以便安全移除陣列元素
    for (let i = window.Scenes.activeRings.length - 1; i >= 0; i--) {
        let p = window.Scenes.activeRings[i];
        p.update(bands);
        p.draw();

        if (p.isDead) {
            window.Scenes.activeRings.splice(i, 1);
        }
    }

    // 4. 繪製綠色網格地板
    push();
    stroke(120, 90, 90, 0.4);
    strokeWeight(1.2);
    translate(0, 250, 0);
    for (let i = -600; i <= 600; i += 40) {
        line(i, 0, -600, i, 0, 600);
        line(-600, 0, i, 600, 0, i);
    }
    
    // 撞擊圈
    colorMode(HSB, 360, 100, 100, 1);
    for (let i = window.Scenes.groundImpacts.length - 1; i >= 0; i--) {
        let hit = window.Scenes.groundImpacts[i];
        let alpha = hit.life / 255;
        if (alpha <= 0) {
            window.Scenes.groundImpacts.splice(i, 1);
            continue;
        }
        push();
        translate(hit.x, 1, hit.z);
        rotateX(HALF_PI);
        noFill();
        stroke(120, 90, 100, alpha);
        strokeWeight(2 * alpha + 0.5);
        ellipse(0, 0, hit.radius * 2);
        pop();
        hit.life -= 10;
        hit.radius += 5;
    }
    while (window.Scenes.groundImpacts.length > MAX_GROUND_IMPACTS) {
        window.Scenes.groundImpacts.shift();
    }
    colorMode(HSB, 360, 100, 100, 1);
    pop();

    pop();
};