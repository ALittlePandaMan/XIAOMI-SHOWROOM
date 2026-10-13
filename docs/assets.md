# Asset maintenance / 资源维护

## Directory and naming conventions / 目录与命名

- Package: `xiaomi-showroom`; repository: `XIAOMI-SHOWROOM`.
- Resource directories, scripts, and tests use lowercase names with hyphens. React components and rendering classes keep PascalCase; utility modules keep camelCase.
- Models are separated into `n70`, `n90-standard`, `n90-explorer`, and `shared`.
- Existing URL vehicle IDs remain unchanged. `n90` maps to `n90-explorer` on disk; N70 Max and Pro share `n70`.
- GLB object names, `webId`, material names, and atlas numbers are functional identifiers. Preserve them when exporting.

包名、目录和脚本命名已统一；模型内部标识关联材质处理与机构动画，不应为命名美观而批量替换。

## Updating models / 更新模型

1. Export the updated GLB from the separately maintained Blender source. Preserve object identifiers, hierarchy, transforms, UVs, normals, and morph targets.
2. Update `manifest.json` with any changed mechanism trajectories. TV, doors, steps, and roof animation depend on these records.
3. Replace the appropriate model under `public/models/`. Shared wheels belong in `public/models/shared/`.
4. Review the change and update the corresponding SHA-256 in `tests/fixtures/model-hashes.json`.
5. Run `npm run check` and visually inspect all affected finishes and mechanisms in a browser.

Blender 源文件和导出时使用的本地脚本在仓库外维护。网站运行无需这些文件；重新导出时必须同步动画索引，并在浏览器中验证效果。

The optional command below applies Meshopt transport compression without a quantization transform, mesh simplification, texture resizing, or texture re-encoding. It writes to a distinct output path; node names and transforms are preserved, but unused resources can be pruned.

下面的可选工具保留输入属性精度和纹理内容，仅做资源去重、清理和 Meshopt 压缩。请使用单独输出文件，检查后再替换正式资源。

```bash
npm run assets:optimize -- export-cache/car.raw.glb export-cache/car.optimized.glb
```

## Environment maps / 环境贴图

Each `.rgba16f` file contains little-endian linear RGBA half-float data. Its JSON sidecar records dimensions and orientation. The `.gz` file contains exactly the same bytes after decompression. Both versions are committed so older clients can fall back to the original.

每组环境数据保留原始文件、JSON 元数据和无损 gzip 文件。修改原始数据后执行：

```bash
npm run assets:compress
npm run assets:check
```

## What is excluded / 不进入仓库的内容

`node_modules/`, `dist/`, `.env*`, local credentials, raw export caches, native Blender files, screenshots, historical reports, and temporary inspection scripts are excluded. These are not required to run the checked-in web application.

依赖、构建产物、环境文件、凭据、原始导出缓存、Blender 文件、历史截图及临时检查脚本不进入 Git。
