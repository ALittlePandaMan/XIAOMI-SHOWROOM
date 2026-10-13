# Xiaomi Showroom

[English](README.en.md) · **简体中文**

基于 React、TypeScript 和 Three.js 的交互式 3D 汽车展厅，支持 N70 系列、N90 Max 与 N90 Max 探索版的外观和内饰浏览、配色切换及机构动画。

这是独立开发的非官方展示项目。车型名称与商标归其各自权利人所有。

## Docker 快速部署

```bash
docker run -d --name xiaomi-showroom --restart unless-stopped -p 8080:8080 ghcr.io/alittlepandaman/xiaomi-showroom:latest
```

访问 [http://localhost:8080](http://localhost:8080)。镜像支持 AMD64、ARM64，包含全部网页资源。也可以在项目目录运行 `docker compose up -d`。

[版本下载](https://github.com/ALittlePandaMan/XIAOMI-SHOWROOM/releases)提供静态网站压缩包、Compose 部署包及 SHA-256 校验值。详细配置见[部署说明](docs/deployment.md)。

## 功能

- **多车型展厅**：N70 Max、N70 Pro、N90 Max、N90 Max 探索版。
- **外观配置**：按车型切换车漆、轮毂及前脸饰板，旋转、缩放、复位和全屏浏览。
- **内饰体验**：按车型切换座位视角与砂陶米、摩卡棕、暗夜黑配色。
- **机构联动**：点击车门和尾门开关，踏板联动；支持适用车型的翻转电视、探索版升顶及投影功能。
- **可分享配置**：外观与内饰有独立路由，车型、配色、轮毂及饰板保存在 URL 中。
- **响应式界面**：适配桌面和手机，支持鼠标拖动及触控缩放。
- **实时渲染**：PBR 材质、环境照明、镜面反射、接触阴影、车灯效果；静止时按需绘制。

各车型的选项以页面实际提供的内容为准。

## 本地运行

需要 **Node.js 22.17 或更高版本**、npm，以及支持 WebGL 2 的浏览器。

```bash
git clone https://github.com/ALittlePandaMan/XIAOMI-SHOWROOM.git
cd XIAOMI-SHOWROOM
npm ci
npm run dev
```

访问 [http://127.0.0.1:5173](http://127.0.0.1:5173)。模型、贴图和字体随仓库提供，运行时不需要 Blender、Git LFS 或额外的 API 密钥。

首次加载需要下载当前车型资源并编译着色器。完整模型保留原有精度，设备的 GPU 性能会影响帧率。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动本地开发服务 |
| `npm run build` | TypeScript 检查并构建到 `dist/` |
| `npm run preview` | 在端口 4173 预览构建结果 |
| `npm test` | 资源完整性、机构变换及渲染辅助数据检查 |
| `npm run check` | 执行测试和生产构建 |
| `npm run assets:check` | 检查资源引用、模型校验和及 HDR 压缩数据 |
| `npm run assets:compress` | 重新生成环境贴图的无损 gzip 文件 |

自动测试不依赖运行中的开发服务器，也不需要 GPU；它们不替代浏览器中的视觉验收。GitHub Actions 会检查代码、构建镜像并测试容器中的路由和资源；`main` 推送发布 `edge` 镜像，版本标签发布正式镜像及 GitHub Release。

## 路由与车型

| URL 参数 | 车型 | 模型目录 |
| --- | --- | --- |
| `model=n70` | N70 Max | `public/models/n70/` |
| `model=n70-pro` | N70 Pro | 共用 N70 模型 |
| `model=n90-standard` | N90 Max | `public/models/n90-standard/` |
| `model=n90` | N90 Max 探索版 | `public/models/n90-explorer/` |

页面路径为 `/exterior` 和 `/interior`。例如：

```text
/interior?model=n70#paint=blue&wheel=2&trim=brushed&interior=black
/exterior?model=n90-standard#paint=teal&wheel=3&trim=brushed&interior=mocha
```

车门、升顶等临时开合状态不写入 URL。旧链接中的 `model=n90` 保持有效。

## 项目结构

```text
.
├── src/                       # React 界面、Three.js 场景与材质
│   ├── App.tsx                # 展厅交互界面
│   ├── Showroom.ts            # 模型加载、渲染及机构动画
│   ├── vehicles.ts            # 车型、选项和资源目录映射
│   └── config.ts              # 配色、轮毂及默认配置
├── public/
│   ├── models/
│   │   ├── n70/               # N70 车身和动画索引
│   │   ├── n90-standard/      # N90 Max 车身和动画索引
│   │   ├── n90-explorer/      # 探索版车身、投影和动画索引
│   │   └── shared/            # 共用轮毂
│   ├── textures/              # 内饰、轮胎等外部贴图
│   ├── environments/          # HDR 数据、gzip 与来源说明
│   ├── images/                # 配置缩略图
│   ├── icons/                 # 界面图标
│   └── fonts/                 # MiSans 字体及原许可
├── scripts/                   # 可复用的资源维护工具
├── tests/                     # 无需 GPU 的自动检查
├── docs/                      # 资源维护与部署说明
├── Dockerfile                 # Node 构建 + Nginx 运行镜像
├── compose.yaml               # 拉取已发布镜像部署
├── docker/nginx.conf          # 路由、静态资源及缓存配置
└── .github/workflows/ci.yml    # 测试、镜像发布及 Release
```

网页直接加载 `public/models/` 中的 GLB。Blender 源文件在仓库外维护；重新导出后，需要同步相应 GLB 和 `manifest.json`。网页中的部分材质、灯光和几何修正由 `src/` 在加载后应用。模型内部对象名与动画索引关联，不应批量重命名。

更多说明：[资源维护](docs/assets.md) · [部署](docs/deployment.md)。

## 构建与部署

```bash
npm run build
npm run preview
```

将完整 `dist/` 部署至静态服务器的域名根目录，或使用上述 Docker 镜像。镜像已经配置 BrowserRouter 路由回退、资源缓存与健康检查。发布镜像和 Release 不会自动修改你的服务器；更新服务器时执行 `docker compose pull && docker compose up -d`。

发布下一个版本：先确保工作区干净，执行 `npm version patch`，再执行 `git push origin main --follow-tags`。版本标签必须与 `package.json` 一致。正式版本更新 `latest`；预发布版本不会覆盖它。

## 许可证与资源来源

项目原创代码采用 [MIT License](LICENSE)。随附第三方字体、参考图标、环境贴图、纹理、商标及其他素材不因本仓库的 MIT 许可证而改变原有权利或许可。

相关来源及许可范围见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
