# 音调检测原理与运作方式

## 一、音调检测的原理

### 1. **ML5.js CREPE 模型（主要方法）**
- **原理**：使用深度学习模型 CREPE (Convolutional Representation for Pitch Estimation)
- **工作方式**：
  1. 从麦克风获取音频流
  2. 将音频流输入 CREPE 模型
  3. 模型分析音频并返回频率（Hz）
  4. 通过 `gotPitch()` 回调函数接收结果
  5. 持续调用 `getPitch()` 保持实时检测

### 2. **FFT + HPS 备用方法**
- **原理**：当 ML5 失败或未加载时使用
- **工作方式**：
  1. 使用 FFT (Fast Fourier Transform) 分析频谱
  2. 在 80-1200 Hz 范围内寻找峰值（人声范围）
  3. 使用 HPS (Harmonic Product Spectrum) 提高准确度
  4. 计算置信度，过滤噪声

### 3. **频率到音符转换**
- **公式**：`n = 12 * log2(frequency / 440)`
- **基准**：A4 = 440 Hz
- **结果**：将频率转换为音符名称（如 C4, D#3）和索引（0-11）

## 二、当前问题分析

### 问题 1：ML5 模型可能未正确加载
- **原因**：micStream 获取失败或模型加载失败
- **症状**：`gotPitch()` 回调不触发或返回 null

### 问题 2：FFT 备用方法被禁用
- **原因**：代码中注释掉了 `detectFromFFT()`
- **症状**：ML5 失败时没有备用检测

### 问题 3：currentNoteIndex 未正确更新
- **原因**：`freqToNote()` 可能在某些情况下未调用
- **症状**：音调区域不变色

## 三、修复方案

1. **启用 FFT 备用方法**：当 ML5 失败时自动使用
2. **确保 currentNoteIndex 更新**：在每次频率更新时调用 `freqToNote()`
3. **添加错误处理**：ML5 失败时自动降级到 FFT

