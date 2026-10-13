# Xiaomi Showroom

**English** · [简体中文](README.md)

An interactive 3D vehicle showroom built with React, TypeScript, and Three.js. Explore the exterior, interior, configurations, and animated mechanisms of the N70 series, N90 Max, and N90 Max Explorer.

This is an independently developed, unofficial showcase. Vehicle names and trademarks belong to their respective owners.

## Live demo

[Open the 3D showroom](https://alittlepandaman.github.io/XIAOMI-SHOWROOM/) on a phone, tablet, or computer. No Docker installation is required.

GitHub Pages hosts the static site and updates it after pushes to `main`. The first visit downloads the selected vehicle's models and textures; the device must support WebGL.

## Deploy with Docker

```bash
docker run -d --name xiaomi-showroom --restart unless-stopped -p 8080:8080 ghcr.io/alittlepandaman/xiaomi-showroom:latest
```

Open [http://localhost:8080](http://localhost:8080). The image supports AMD64 and ARM64 and includes all website assets. Alternatively, run `docker compose up -d` from this repository.

[Releases](https://github.com/ALittlePandaMan/XIAOMI-SHOWROOM/releases) include static website archives, a Compose deployment bundle, and SHA-256 checksums. See the [deployment guide](docs/deployment.md) for configuration.

## Features

- **Multiple vehicles:** N70 Max, N70 Pro, N90 Max, and N90 Max Explorer.
- **Exterior configuration:** vehicle-specific paints, wheels, and fascia finishes, with orbit, zoom, reset, and fullscreen controls.
- **Interior views:** vehicle-specific seating viewpoints and Sand, Mocha, and Black finishes.
- **Animated mechanisms:** individually operated doors and tailgate with linked steps; supported vehicles include a folding TV, while the Explorer includes roof and projector features.
- **Shareable configurations:** separate exterior/interior routes; vehicle, paint, wheels, trim, and interior finish are stored in the URL.
- **Responsive controls:** desktop and mobile layouts with mouse and touch interaction.
- **Real-time rendering:** PBR materials, environment lighting, mirror reflections, contact shadows, and lamp effects, with rendering on demand when idle.

Available options vary by vehicle.

## Getting started

Use **Node.js 22.17 or newer**, npm, and a browser with WebGL 2 support.

```bash
git clone https://github.com/ALittlePandaMan/XIAOMI-SHOWROOM.git
cd XIAOMI-SHOWROOM
npm ci
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Models, textures, and fonts are included. Running the application requires no Blender installation, Git LFS, or API keys.

The first load downloads vehicle resources and compiles shaders. Models retain their existing detail; GPU capabilities affect frame rate.

See [performance measurements](docs/performance.md) for phone testing. `?perf=1` enables local diagnostics and report export; add `reference=1` to compare the original render path.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Type-check and build into `dist/` |
| `npm run preview` | Preview the build on port 4173 |
| `npm test` | Check resources, mechanism transforms, and auxiliary rendering data |
| `npm run check` | Run tests and the production build |
| `npm run assets:check` | Validate asset references, model checksums, and HDR compression |
| `npm run assets:compress` | Regenerate lossless gzip environment files |

Tests run without a development server or GPU. They do not replace visual review in a browser. GitHub Actions validates the code, builds the image, and tests container routes and assets. Pushes to `main` publish the `edge` image; version tags publish versioned images and GitHub Releases.

## Routes and vehicles

| Query parameter | Vehicle | Model directory |
| --- | --- | --- |
| `model=n70` | N70 Max | `public/models/n70/` |
| `model=n70-pro` | N70 Pro | Shared N70 model |
| `model=n90-standard` | N90 Max | `public/models/n90-standard/` |
| `model=n90` | N90 Max Explorer | `public/models/n90-explorer/` |

The page routes are `/exterior` and `/interior`. Examples:

```text
/interior?model=n70#paint=blue&wheel=2&trim=brushed&interior=black
/exterior?model=n90-standard#paint=teal&wheel=3&trim=brushed&interior=mocha
```

Temporary door and roof states are not persisted in the URL. Existing `model=n90` links remain valid.

## Structure

```text
.
├── src/                       # React UI, Three.js scene, and materials
│   ├── App.tsx                # Showroom interface
│   ├── Showroom.ts            # Loading, rendering, and mechanism animation
│   ├── vehicles.ts            # Vehicle options and asset mapping
│   └── config.ts              # Paints, wheels, and defaults
├── public/
│   ├── models/
│   │   ├── n70/               # N70 body and animation manifest
│   │   ├── n90-standard/      # N90 Max body and animation manifest
│   │   ├── n90-explorer/      # Explorer body, projector, and manifest
│   │   └── shared/            # Shared wheels
│   ├── textures/              # External cabin and tire textures
│   ├── environments/          # HDR data, gzip copies, and provenance
│   ├── images/                # Configuration thumbnails
│   ├── icons/                 # UI icons
│   └── fonts/                 # MiSans fonts and original license
├── scripts/                   # Reusable asset maintenance tools
├── tests/                     # GPU-independent checks
├── docs/                      # Asset and deployment notes
├── Dockerfile                 # Node build + Nginx runtime
├── compose.yaml               # Deploy the published image
├── docker/nginx.conf          # Routing, assets, and caching
└── .github/workflows/ci.yml    # Tests, container publishing, and releases
```

The browser loads GLBs directly from `public/models/`. Native Blender files are maintained separately. Re-exporting a model requires updating its GLB and `manifest.json`. Some material, lighting, and geometry corrections are applied by `src/` after loading. Internal object names are linked to animation identifiers and should not be renamed in bulk.

See [asset maintenance](docs/assets.md) and [deployment](docs/deployment.md).

## Build and deploy

```bash
npm run build
npm run preview
```

Serve the complete `dist/` directory from the root of a static host, or use the Docker image. The image includes SPA routing, cache rules, and a health check. Publishing an image or release does not update your server automatically; use `docker compose pull && docker compose up -d` to update it.

To publish the next version, start with a clean working tree, run `npm version patch`, then `git push origin main --follow-tags`. The tag must match `package.json`. Stable releases update `latest`; prereleases do not.

## License and asset attribution

Original project code is released under the [MIT License](LICENSE). Included third-party fonts, reference icons, environments, textures, trademarks, and other materials retain their own rights and licenses.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for provenance and license scope.
