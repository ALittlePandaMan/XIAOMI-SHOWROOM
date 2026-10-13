# Deployment / 部署

## Published Docker image / 已发布镜像

```bash
docker run -d --name xiaomi-showroom --restart unless-stopped -p 8080:8080 ghcr.io/alittlepandaman/xiaomi-showroom:latest
```

Open / 访问 [http://localhost:8080](http://localhost:8080).

Images include all vehicle assets and support `linux/amd64` and `linux/arm64`. Nginx runs as UID 101 on container port 8080. The health endpoint is `/healthz`.

镜像包含所有车型资源，支持 AMD64 和 ARM64。Nginx 以非 root 用户运行，容器端口为 8080，健康检查地址为 `/healthz`。

For reproducible deployments, replace `latest` with a version such as `1.0.0`, or use the digest printed in its GitHub Release.

需要固定版本时，将 `latest` 换为 `1.0.0` 等版本号，或使用 Release 中记录的镜像摘要。

## Docker Compose

With the repository or the `*-deploy.zip` release bundle / 使用仓库或 Release 部署包：

```bash
docker compose up -d
docker compose ps
docker compose logs -f
```

Optionally copy `.env.example` to `.env` and change `SHOWROOM_PORT` or `SHOWROOM_IMAGE`. These variables configure Compose, not the frontend build. The default port binds on all host interfaces; use a reverse proxy for a domain and HTTPS.

可复制 `.env.example` 为 `.env` 修改端口和镜像版本。默认端口绑定宿主机所有网卡，域名与 HTTPS 可由反向代理提供。Compose 使用只读根文件系统及临时 `/tmp`，应用不需要持久化卷。

Update / 更新：

```bash
docker compose pull
docker compose up -d
```

Stop / 停止：

```bash
docker compose down
```

## Build an image locally / 本地构建镜像

```bash
docker compose -f compose.yaml -f compose.build.yaml up -d --build
```

Or / 或：

```bash
docker build -t xiaomi-showroom:local .
docker run --rm -p 8080:8080 xiaomi-showroom:local
```

Docker uses Node 22 to install locked dependencies, run tests, and build the site. The final stage contains Nginx and the site, without Node, development dependencies, or native Blender files. Base images are pinned by digest; update these pins when adopting newer base images.

Docker 内部完成依赖安装、测试和构建，最终镜像仅包含 Nginx 与网站文件。基础镜像使用摘要固定版本，升级时更新 Dockerfile 中的摘要。

On Linux or a Bash environment with Docker, curl, and Node available, run the same container checks as CI:

在具备 Docker、curl、Node 的 Linux/Bash 环境中，可运行与 CI 相同的容器检查：

```bash
bash scripts/smoke-container.sh xiaomi-showroom:local
```

The check uses a temporary local port and verifies SPA routes, missing-file 404s, cache headers, byte ranges, every GLB checksum, and lossless HDR responses. Its temporary container is removed on exit.

检查会验证路由刷新、缺失资源 404、缓存、分段请求、全部模型校验和及 HDR 数据，结束后移除临时容器。

## GitHub Actions and releases / 自动发布

| Trigger / 触发 | Result / 结果 |
| --- | --- |
| Pull request | Tests, Docker build, container checks; no publishing / 测试和容器检查，不发布 |
| Push to `main` | Checks then GHCR `edge` and `sha-*` images / 检查后发布开发版镜像 |
| Push `v1.0.0`-style tag | Versioned multi-architecture image and GitHub Release / 多架构版本镜像与 Release |
| Manual workflow run | Re-run checks; publish only from `main` or a version tag / 手动运行，只有主分支或版本标签发布 |

Stable tags publish `v1.0.0`, `1.0.0`, `1.0`, `1`, and `latest`. Prereleases such as `v1.1.0-rc.1` publish their own version and are marked as prereleases, without replacing stable aliases.

正式版本发布完整版本及主次版本别名。`rc` 等预发布只发布自身版本，不覆盖 `latest`。Release 附带静态网站 ZIP/TAR.GZ、Compose 部署 ZIP、`SHA256SUMS` 及镜像摘要。

To publish a new stable version from a clean `main` checkout / 在干净的 `main` 工作区发布下一个版本：

```bash
npm version patch
git push origin main --follow-tags
```

The tag must match `package.json`; a mismatch fails before publishing. The workflow uses GitHub's built-in `GITHUB_TOKEN`, with `packages: write` for the image job and `contents: write` for the release job. No Docker Hub account or additional repository secret is required.

标签版本与 `package.json` 必须一致。工作流使用 GitHub 自带令牌，不需要额外 Docker Hub 账号或仓库 Secret。

When setting up a fork, GHCR creates new packages as private by default. To allow anonymous pulls, change the package's visibility to Public in its GitHub package settings. For a private package, authenticate with a token that has `read:packages`:

在 Fork 仓库首次发布时，GHCR 默认新包为私有。匿名拉取需要在 GitHub 包设置中将可见性改为 Public；私有包需使用包含 `read:packages` 的令牌登录：

```bash
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

Official references / 官方说明：[GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry), [Nginx unprivileged images](https://github.com/nginx/docker-nginx-unprivileged).

## Build / 构建

```bash
npm ci
npm run check
npm run preview
```

Deploy the complete `dist/` directory. The app is a static site with no backend or required environment variables. `npm run preview` is for checking the build locally.

发布完整 `dist/` 即可，无需后端或环境变量。`preview` 用于本地检查构建结果。

## Routes and hosting / 路由与托管

The current app uses absolute asset URLs and BrowserRouter. Host it at a domain root. Serve `/models/`, `/textures/`, `/environments/`, `/fonts/`, `/images/`, and `/icons/` as files; route page requests to `index.html`.

当前使用根路径资源 URL 和 BrowserRouter，适合部署至域名根目录。静态资源按文件提供，页面路由回退至 `index.html`。

Example Nginx server locations / Nginx 路由示例：

```nginx
root /var/www/xiaomi-showroom/dist;
index index.html;

location ~ ^/(assets|models|textures|environments|fonts|images|icons)/ {
    try_files $uri =404;
}

location / {
    try_files $uri $uri/ /index.html;
}
```

GitHub repository hosting and your running server are separate. The workflow publishes images and release files; it does not connect to your server. A GitHub Pages project URL such as `/XIAOMI-SHOWROOM/` would additionally require changes to the router and all absolute asset URLs.

工作流发布镜像和 Release，不会连接并修改你的服务器。若部署到 GitHub Pages 的仓库子路径，需要另外适配路由和资源路径。

## Assets and caching / 资源与缓存

- Transfer `.glb`, `.rgba16f`, and `.rgba16f.gz` without modifying their contents. The loader accepts either a gzip response or a response already decompressed by the server.
- Return actual assets rather than an HTML fallback for missing asset paths.
- Vite-generated hashed files under `assets/` can use long-lived immutable caching. Model and texture filenames are stable, so use revalidation or purge their cache when updating them.
- The repository includes binary assets directly; there is no LFS fetch step.

保持二进制资源内容不变；缺失资源不要返回页面 HTML。带哈希的构建文件可长期缓存，固定名称的模型和贴图更新后需要重新验证或刷新缓存。
