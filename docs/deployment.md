# Deployment / 部署

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

GitHub repository hosting and website hosting are separate. The included workflow checks the project; it does not deploy it. A GitHub Pages project URL such as `/XIAOMI-SHOWROOM/` would additionally require changes to the router and all absolute asset URLs.

GitHub 仓库与网站托管分开配置。当前 CI 只检查项目，不发布网站。若部署到 GitHub Pages 的仓库子路径，需要另外适配路由和资源路径。

## Assets and caching / 资源与缓存

- Transfer `.glb`, `.rgba16f`, and `.rgba16f.gz` without modifying their contents. The loader accepts either a gzip response or a response already decompressed by the server.
- Return actual assets rather than an HTML fallback for missing asset paths.
- Vite-generated hashed files under `assets/` can use long-lived immutable caching. Model and texture filenames are stable, so use revalidation or purge their cache when updating them.
- The repository includes binary assets directly; there is no LFS fetch step.

保持二进制资源内容不变；缺失资源不要返回页面 HTML。带哈希的构建文件可长期缓存，固定名称的模型和贴图更新后需要重新验证或刷新缓存。
