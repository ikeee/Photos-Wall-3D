# Photos Wall 3D（3D 互动照片墙）

面向学校公共区域（架空层、大堂）大型 LED 屏的互动视觉应用：摄像头捕捉人体动作，照片墙实时跟随并响应手势。

**部署目标：OrangePi 5 Pro（RK3588S / Mali-G610 / 4GB）弱机优化版。**

## ✨ 功能

- **3D 球面照片墙**：斐波那契球面均匀分布，平滑旋转；支持球面/立方体/瀑布三种布局
- **人体追踪**：MediaPipe **tasks-vision**（新版 API）PoseLandmarker，照片墙跟随身体重心偏转
- **手势交互**（防误触 + 冷却 + 需保持触发）：
  | 手势 | 动作 | 效果 |
  |---|---|---|
  | 🕐 张开双臂（T 字）| 保持 0.4s | 随机照片飞向屏幕中心特写，5s 后飞回 |
  | 👋 挥手 | 单侧手举起横向摆动 | 切换布局：球面 ↔ 立方体 ↔ 瀑布 |
  | 🙌 双手上举 | 保持 0.35s | 全场照片脉冲彩蛋 |
- **后台换照片**：`#/admin` 管理页上传/删除，原图自动压缩 + 生成 320px 缩略图（3D 墙专用省显存），展示端热更新
- **科幻 HUD**：骨骼点叠加、目标锁定、遥测面板、引导页

## 🛠️ 技术栈

React 19 · Three.js + @react-three/fiber + drei · **@mediapipe/tasks-vision 1.0.1**（替代已冻结的 legacy `@mediapipe/pose`）· Vite 6 · Express（后端）· sharp（图片处理）· Tailwind（本地化）

## 🚀 快速开始（开发）

```bash
npm install
npm run samples        # 生成 24 张内置示例照片（需 python3-PIL）
npm run server         # 启动后端 :8787（照片 API + 静态托管）
npm run dev            # Vite 开发服务器 :3000（/api 代理到 8787）
```

访问 `http://<IP>:3000`。管理后台 `http://<IP>:3000/#/admin`（Token 见 `data/.admin_token`）。

## 📦 部署（OrangePi + LED 屏）

```bash
npm run build                        # 产物 dist/（含 wasm/模型/照片，全本地离线）
sudo bash deploy/install.sh backend  # 后端注册 systemd 开机自启
# 交互测试通过后：
bash deploy/install.sh kiosk         # 登录后自动全屏 kiosk（chromium）
```

- 展示端：`http://<IP>:8787/`；后台：`http://<IP>:8787/#/admin`
- kiosk 手动启动：`DISPLAY=:0 deploy/start-kiosk.sh`（崩溃自动重启）
- 管理 Token：首次运行自动生成于 `data/.admin_token`，或用环境变量 `ADMIN_TOKEN` 固定

## ⚙️ 弱机性能优化（要点）

| 优化 | 说明 |
|---|---|
| 推理降采样 | 摄像头 640×480 → 推理输入 320×240（`inputScale: 0.5`） |
| 推理节流 | 默认 ~15fps（`inferenceIntervalMs: 66`），3D 渲染仍 60fps，姿态由 lerp 平滑 |
| HUD 状态节流 | React setState 5Hz，姿态本体走 ref，3D 层**零重渲染** |
| wasm 多线程 | 后端响应 COOP/COEP 头 → SharedArrayBuffer 生效（实测已启用） |
| delegate | 默认 CPU（XNNPACK，实测 65ms/帧）；GPU delegate 实测 62ms 无优势，可 `?delegate=gpu` 切换 |
| 3D 减负 | dpr=1（1080p）、Stars 6000→1200、粒子数组 useMemo 固定缓冲、去掉运行时 HDR Environment、特写卡片外零每帧分配 |
| 纹理内存 | 3D 墙使用 320px 缩略图；80 张 ≈ 30MB 显存预算内 |

## 🧪 测试与调试

```bash
npm run typecheck          # TS 检查
npm run test:gestures      # 手势引擎单元测试（10 项：触发/冷却/防误触/破势）
```

- `?debug=pose`：用静态人物图模拟摄像头，无人在场也能验证整条链路（右上角显示推理耗时）
- `?debug=pose&poseImg=/debug/xxx.jpg`：指定测试图
- `?debug`：性能浮层（3D FPS + 推理 ms + 姿态状态）
- `scripts/cdp_probe.mjs`：连 Chromium 远程调试端口读取状态/截图（验收工具）

## 📁 目录结构

```
App.tsx               主程序（摄像头/姿态/手势/状态管理）
components/           3D 场景 + 管理后台 + 调试 HUD
utils/config.ts       全部调优参数集中配置
utils/posePipeline.ts MediaPipe tasks-vision 封装（降采样/节流/回退）
utils/poseUtils.ts    手势状态机（T字/挥手/上举 + 重心计算）
server.mjs            后端（照片 API + 静态托管 + COOP/COEP）
public/               wasm / 模型 / 示例照片 / Tailwind（全本地）
deploy/               systemd 单元 + kiosk 脚本 + 安装脚本
scripts/              示例图生成 / 单元测试 / CDP 探针
```

## ⚠️ 已知说明

- 原项目依赖 esm.sh CDN importmap 运行时加载（弱机首屏慢、离线不可用），已改为 Vite 全量本地打包
- 原项目每次特写触发都会销毁重建整条姿态管线（黑屏数秒），已修复（回调 ref 稳定化）
- 无摄像头时优雅降级：显示 Camera Error 面板，照片墙继续自转
- GPU delegate 在 Chromium 110 + libmali blob 下可用但无性能优势；如升级新版 Chromium 可复测
