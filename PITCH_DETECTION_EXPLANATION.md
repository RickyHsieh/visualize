# 音調偵測原理（現行版本）

專案目前 **完全使用 p5.FFT** 做峰值分析，再把主頻轉換成音名。若想要更精準的 AI 音名，可額外載入 ml5/CREPE，但預設不使用。

---

## 1. FFT 峰值分析（預設）
1. 使用 `p5.FFT` 取得即時頻譜 (`Audio.spectrum`)。
2. 在頻譜上尋找最大能量的 bin，推算對應的頻率 `freq`。
3. 以峰值與平均能量之比計算簡易置信度 `confidence`。
4. 若 `freq > 40 Hz` 且置信度足夠，即視為目前的主音高。

優點：零延遲、在 `draw()` 迴圈內即可使用，非常適合視覺化。  
缺點：同時會偵測到泛音，但對視覺效果通常是加分的。

---

## 2. 頻率轉音名
- 公式：`n = 12 * log2(freq / 440)`，其中 440 Hz = A4。
- 取整數後對 12 取餘數得到音階索引（0 ~ 11）。
- 這個索引用於顏色映射（例如 Faraday 12 分區／Falling 彗星顏色）。

---

## 3. 可選：ml5/CREPE
若未來想顯示更精準的音名或使用 AI 音高模型，可重新載入：

```html
<script src="https://unpkg.com/ml5@latest/dist/ml5.min.js"></script>
```

然後把 `PitchDetection` 換成 CREPE 模式即可（程式碼已保留 FFT 管線，方便切換）。

---

## 常見擴充
1. 只想要頻譜資料：直接使用 `Audio.spectrum` 或 `Audio.getFrequencyBands()`。
2. 想顯示主頻 Hz：使用 `PitchDetection.currentFrequency`（FFT 結果）。
3. 想換成自己的峰值演算法：修改 `Audio.getDominantFrequency()` 即可。 

