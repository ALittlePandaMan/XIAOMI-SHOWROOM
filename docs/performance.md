# Rendering performance / 渲染性能

Original models, textures, HDR data, drawing-buffer resolution and effects are preserved. The renderer batches compatible opaque parts when measured to help, caches view-independent seat samples in FP32 auxiliary textures, shares mirror workspaces, and stops scheduling frames after settling. Unsupported GPU features retain the original calculation/drawing path.

保留原有模型、贴图、HDR、分辨率和效果。批处理限于不超过 4096 顶点的兼容不透明部件。加载时针对外观和内饰分别做同画质配对计时，只有显示收益且没有明显回退时才启用；GPU 无计时扩展或结果不明确时保留原生绘制。通过画质检查的座椅宽域采样使用 FP32 缓存，其他优化包括镜面工作区复用和空闲休眠。GPU 不支持相应功能时继续使用原算法。

The compiled-light candidate is disabled by default: constant replacement failed the interior visual threshold (SSIM 0.998722 versus the required 0.999). The original camera-space light condition is retained. Comparison reports preserve every attempted path and score, including fallbacks.

灯光条件编译候选默认关闭：常量替换未通过内饰画质门槛（SSIM 0.998722，要求 0.999），继续使用原相机空间灯光判断。对比报告保留每次尝试及回退的分数。

Rejected batching candidates release their duplicate GPU buffers. Without both multi-draw and GPU timer support, the renderer does not allocate display batches. On the desktop validation device all three vehicle trials retained native drawing.

批处理未显示收益时会释放重复的 GPU 缓冲；同时缺少多重绘制或 GPU 计时能力时，不分配显示批次。桌面验证设备上的三个车型均保留原生绘制。

N90 Max's seat-cache candidate also failed the rear-seat threshold (SSIM 0.996932) and is disabled for that vehicle, using the complete original shader. N70's tested driver/rear views passed (0.999984 / 0.99999995). These are desktop visual checks, not phone performance results.

N90 Max 的座椅缓存也未通过后排门槛（SSIM 0.996932），该车型默认使用完整原座椅着色器。N70 的主驾、后排检查通过（0.999984 / 0.99999995）。这些是桌面画质验证，不能作为手机性能结果。

Additional fixed-view checks: N70 black interior with television deployed passed at 0.999807 (screen region 1.0); Explorer interior passed at 1.0 and exterior at 0.99999993. After the TV animation and comparison settled, a six-second idle observation showed unchanged frame and scheduler counters (911 frames, 915 callbacks), with no pending frame or timer.

补充固定视角检查：N70 黑色内饰及展开电视通过（0.999807，屏幕区域 1.0）；探索版内饰 1.0、外观 0.99999993。电视动画和对比结束后观察至少 6 秒，渲染帧数保持 911、调度次数保持 915，没有待执行帧或定时器。

Final default-path checks also passed: N70 exterior 0.99999987, N90 Max exterior 0.99999879, and N90 Max rear cabin 1.0 after retaining its original seat algorithm. All reported critical regions passed the same 0.999 threshold. Local unit/build checks passed 13 tests; asset checks verified 7 unchanged GLBs. Docker smoke checks covered routes, cache headers, byte ranges, all models and 6 HDR environments.

最终默认路径复测通过：N70 外观 0.99999987、N90 Max 外观 0.99999879、保留原座椅算法后的 N90 Max 后排内饰 1.0。所有记录的关键区域均达到 0.999。13 项本地测试及构建通过，7 个 GLB 校验值未改变；Docker 路由、缓存、范围请求、全部模型和 6 个 HDR 环境检查通过。

## Phone measurements / 手机实测

Open these links in **the same Xiaomi 14 browser**, with identical orientation, viewport, vehicle, paint, wheel and interior selections:

在同一台小米 14、同一个浏览器中打开以下链接，保持横竖屏、视口、车型、配色和轮毂一致：

- [Optimized / 优化模式](https://alittlepandaman.github.io/XIAOMI-SHOWROOM/exterior/?model=n90-standard&perf=1)
- [Reference / 参考模式](https://alittlepandaman.github.io/XIAOMI-SHOWROOM/exterior/?model=n90-standard&perf=1&reference=1)

Wait for loading and camera/feature animations to settle. Select **运行 30 秒测试**. Exterior mode runs a fixed orbit, zoom and door sequence; interior mode runs a fixed look/zoom sequence at the selected seat. Keep the tab visible and avoid touching the car during the run. Select **导出报告** after completion. Alternate the two modes for three runs each to reduce warm-up and thermal bias. Repeat for each vehicle; the model menu preserves diagnostic parameters.

等待加载及动画结束后点击“运行 30 秒测试”，测试时保持页面前台、不操作车辆，结束后“导出报告”。两种模式交替各测三次，降低预热和温度差异。分别测试各车型；车型菜单保留诊断参数。

Reports separate CPU submission, asynchronous GPU elapsed time and actual frame intervals. Unsupported GPU timers remain unavailable; CPU submission is not GPU time. Settled gaps are excluded and disjoint GPU queries are discarded. Object counts and estimated auxiliary buffer sizes are not total VRAM measurements.

报告分别标注 CPU 提交耗时、异步 GPU 耗时与实际帧间隔。没有 GPU 计时扩展时不填造 GPU 数据。显存对象数量和辅助缓冲估算也不是总显存读数。

Reports and screenshots are downloaded locally, with no telemetry endpoint. The panel loads only with `perf=1`. `perf=1&reference=1` selects the former per-frame calculations and native display drawing, with idle polling enabled for comparison.

诊断仅在 `perf=1` 时加载，增加 `reference=1` 使用参考模式。数据只下载到本机、不上传。参考模式保留原逐帧计算、原生绘制和空闲轮询。

## Visual checks / 画质检查

**对比当前画面** freezes the same camera at the same buffer size, renders both paths, and checks local 8×8 RGB SSIM across the full image and projected seat, screen, glass, mirror, paint and lamp regions. A failed 0.999 check restores the relevant original path for that viewer. Download both screenshots to inspect text, seams, quilting, glass and reflections; the aggregate score does not replace checking details.

“对比当前画面”冻结同一相机、使用相同分辨率比较完整画面及关键部件区域。门槛为 SSIM 0.999，未通过会回退优化。下载截图检查文字、缝线、座椅纹理、玻璃和反射，不能只看整体分数。

`npm run check` verifies source GLB checksums, copied attributes and indices, animation transforms, material switches, picking, unsupported-GPU fallback, scheduler sleep, asynchronous query behavior and seat-cache interpolation.

## Acceptance / 验收

Local desktop check, 2026-10-14: Chrome 154 on Windows, 755×603 CSS viewport, DPR 2, 1510×1206 drawing buffer, N70 mocha interior/rear seat, one 30-second run per path. Native drawing was retained by the loading-time trial. These results do **not** meet the 20% target and are not Xiaomi 14 measurements.

| Metric / 指标 | Reference / 参考 | Optimized / 优化 |
| --- | ---: | ---: |
| Frame interval median / 帧间隔中位数 | 6.9 ms | 6.9 ms |
| Frame interval P95 / 帧间隔 P95 | 7.0 ms | 7.1 ms |
| Main GPU median / 主场景 GPU 中位数 | 5.520 ms | 5.368 ms |
| Main GPU P95 / 主场景 GPU P95 | 7.601 ms | 8.006 ms |

桌面单轮测试没有达到 20% 目标；GPU 中位数改善约 2.8%，P95 仍有波动。不能据此承诺手机帧率。需要按上方步骤收集小米 14 的交替重复测量，再决定是否扩大优化范围。

The target is at least 20% improvement in median and P95 frame time in the main interaction scenarios, with 60 FPS as the smoothness goal. Desktop tests, even with mobile viewport dimensions, do not establish a Xiaomi 14 result. Phone data must include browser, viewport, render pixel ratio, scenario and repeated runs; absent phone measurements remain unverified.

目标为主要操作场景的帧耗时中位数和 P95 至少改善 20%，流畅度目标为 60 帧。桌面和移动视口模拟不能作为小米 14 达标证据。实机报告必须记录浏览器、视口、像素比、场景和重复测试结果；没有实机数据时标记未验证。
