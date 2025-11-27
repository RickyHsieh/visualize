# Audio Reactive Visualizer

使用 **p5.js / p5.sound**（如需音名可選接 `ml5.js (CREPE)`）打造的即時音訊視覺化。  
系統會讀取麥克風，分析頻譜、能量、音調，驅動五種不同場景與風格HUD。

---

## 功能一覽

### 音訊分析流程
| 階段 | 套件 | 說明 |
|------|------|------|
| 麥克風輸入 | `p5.AudioIn()` | 取得即時音訊。 |
| 頻譜/能量 | `p5.FFT()` | 計算全頻譜，切成 Low/Mid/High 與整體音量 `bands.vol`。 |
| 節拍/峰值 | `p5.PeakDetect` + 自訂音量差 | 偵測瞬時變化，觸發閃光或波紋。 |
| 音調/峰值偵測 | `p5.FFT` 峰值分析（可選 `ml5.pitchDetection`） | 以 FFT 找主頻峰值驅動畫面，若需要顯示音名可再啟用 CREPE。 |
| HUD 顯示 | 自訂 | 即時列出場景、音高、頻率、置信度、各頻段、相機、FPS 等資訊。 |

### 場景總覽

| ID | 名稱 | 說明 |
|----|------|------|
| 0 | **Cosmos** | 音高控制色調、頻譜推動宇宙粒子。 |
| 1 | **Bass Geometry** | 低頻驅動 3D 方塊，節拍產生閃光與陰影。 |
| 2 | **Particle Heightmap** | 低/中/高頻堆疊成等高線，火花顯示高頻。 |
| 3 | **Faraday Ripple** | 正方形微珠依絕對音調切色，維持自然波紋。 |
| 4 | **Neon Falling Rings** | 聲音生成螢光圈，落地彈跳 1~3 次並在網格留下撞擊亮點。 |

### UI / 互動
- 液態玻璃感的頂部選單；每個場景有獨立相機狀態（拖曳旋轉、滾輪縮放）。
- Pitch HUD 顯示音名、頻率與置信度。
- Data HUD（樣式）顯示即時數據與場景一句話描述。
- 場景模組化：`/scenes/*.js` 中宣告 `window.Scenes.drawXXX` 即可註冊。

---

## 技術堆疊
- [p5.js](https://p5js.org/) + `p5.sound`
- [ml5.js](https://ml5js.org/)（選用：若需要 CREPE 音名偵測可再接入）
- Vanilla JS 模組化（`index.js` 管理核心，`scenes` 負責各場景）

---

## 快速開始

1. **取得程式碼**（無須安裝 npm 套件，使用 CDN）
2. **啟動本地伺服器**（擇一）：
   ```bash
   # Python
   python3 -m http.server 4173

   # VSCode Live Server 或
   npm install -g serve
   serve .
   ```
3. **瀏覽器開啟**，點擊 **Start Mic** 開啟麥克風權限。

---

## 專案結構
```
visualize/
├── index.html
├── index.js               # 音訊處理、場景調度、HUD
├── scenes/
│   ├── scene-static.js    # 麥克風關閉時的背景
│   ├── scene-cosmos.js
│   ├── scene-bass.js
│   ├── scene-heightmap.js
│   ├── scene-faraday.js
│   └── scene-falling.js
└── README.md
```

---

## 客製化建議
- **新增場景**：建立 `scene-*.js`，在檔內寫 `window.Scenes.drawYourScene`，再於 `index.html` 加 script、在 `index.js` 的 `draw()` 補上判斷即可。
- **調整音訊靈敏度**：修改 `Audio.getFrequencyBands()` 或 `PitchDetection` 裡的映射/閾值。
- **HUD 顯示**：`UI.updateDataHud()` 控制面板內容，想加新資訊從這裡擴充。
