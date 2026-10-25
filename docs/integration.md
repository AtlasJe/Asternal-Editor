# 接入、扩展与 Builda 发布

## 环境与运行

使用已构建的 `地图编辑器.html` 只需支持 ES2022、Canvas2D、Blob 和 Pointer Events 的现代浏览器，无需安装或联网。长按约 200ms 后拖动绘制，直接拖动平移；工具栏可切换地形、物体、图层和选区。浏览器完整版本可打开和保存 `.tilemap` 与 `.ui` 文件。首次使用建议编辑示例地图并另存，保留原始文件。

源码版从根目录运行 `python3 -m http.server 8000`，打开 `http://localhost:8000/web/`。Python 建议 3.10+，重建还需 Node.js 18+、npm/npx；构建命令会通过 npm 获取固定版本 `esbuild@0.25.12`，首次构建需网络。运行已构建编辑器不依赖 Node/Python。图片转换脚本若导入 PIL，需要先执行 `python3 -m pip install Pillow`；编辑器与普通离线构建不需要 Pillow。

```sh
python3 tools/tilemap.py index
python3 tools/tilemap.py build
python3 tools/build-builda-preview.py
```

依次更新 `packs/index.json`、生成根目录的完整离线编辑器、生成 `builda-preview/index.html`。最后一个命令只修改预览输出，不改变完整编辑器源码。可用 `python3 tools/tilemap.py build --startup-map maps/城墙验收.tilemap --out dist/wall.html` 构建另一张初始地图。

## 结构与数据格式

- `shared/`：地图模型、自动地形、序列化、交互和 UI；入口是 `shared/app.js`。
- `web/`：Canvas2D 编辑器；`pixi/`：PixiJS 8.6.6 编辑器、独立地图加载器与渲染器。
- `packs/`：运行时 PNG、素材元数据、字体和声音；入口索引为 `packs/index.json`。
- `maps/`：示例 `.tilemap`、`.ui`、截图和生成脚本。
- `tools/`：素材读取、索引和构建；`asset-conversion-examples/`：原包、许可证和转换脚本；`image-generation-examples/`：图片生成示例。
- `builda-preview/`：可重新生成的受限在线试用版本。

`.tilemap` 是 UTF-8 JSON（`format: "tilemap"`、`v: 2`），包含尺寸、瓦片尺寸、背景色、图层、激活图层和非激活图层变暗设置。每层的 `assetMap` 将紧凑字符映射到素材 UUID（Wang 还可能带变体后缀）；`cells` 的具体编码由 `shared/map-cells.js` 管理，`links` 表示连接状态，`objects` 保存物体实例。请通过 `shared/map-file.js` 的 `readMapFile(text, config)` / `writeMapFile(map, config)` 读写，不要根据 JSON 外观自行推断编码。当前校验尺寸为 1–512，瓦片尺寸为 8–128，图层最多 256。

每个素材包有 `pack.meta` 和资源旁的 `.meta`。Dual 按四角占用自动选片；Edge 按四边连接；Wang 按材质标签与标注匹配。带高度地形包含顶部和立面，物体使用 footprint 和可选动画条带。UUID 用于稳定引用，转换时应保留已有 UUID。完整约定与转换实例见 [素材包转换指南](../asset-conversion-examples/README.md)。`.ui` 的模型和读写分别见 `shared/ui.js`、`shared/ui-file.js` 与 `shared/ui-editor.js`，不要将其当作标准第三方编辑器格式。

## 在游戏中加载

最直接的参考实现是 `pixi/load-tilemap.js`。将 `pixi/`、`shared/`、`packs/` 和地图按原结构放到同一静态站点，使用相对 URL：

```html
<div id="game" style="width:960px;height:540px"></div>
<script type="module">
import { loadTilemap } from './pixi/load-tilemap.js';
const loaded = await loadTilemap('./maps/紫峡驿站.tilemap', {
  mount: document.querySelector('#game'),
  configUrl: './shared/config.json',
  packsBase: './packs/'
});
loaded.renderer.setCamera({ x: 0, y: 0, scale: 0.5 });
// loaded.map 是解码后的数据；loaded.world 是加入场景的 Pixi Container。
// 修改地形后调用 loaded.renderer.drawAll()；修改物体后调用 syncObjects()。
</script>
```

这个加载器和 `pixi/renderer.js` 当前从 jsDelivr 导入 PixiJS 8.6.6，需要网络。受 CSP/COEP 限制或要离线部署时，在自己的构建流程中安装并打包 `pixi.js@8.6.6`，将这两个文件的 CDN import 改为本地依赖；不要把未打包的 PixiJS 示例直接用于 Builda 沙箱。Builda 预览使用不依赖 PixiJS 的 Canvas2D 分支。

加载器提供渲染，不提供角色控制、碰撞或游戏循环；游戏逻辑由项目自行接入。使用其他引擎时参考 `shared/grid.js`、`shared/terrain-strategies.js` 和 `web/main.js` 移植解码、选片与绘制逻辑，或直接复用 Canvas2D 方案。

## 移动端与 Internal AI

移动端可在现代浏览器使用已构建的编辑器，Pointer Events 支持长按与拖动。Internal AI 集成时先读本指南、素材转换指南及 `shared/map-file.js`、`shared/map-cells.js`、`shared/grid.js`、`shared/terrain-strategies.js`，读取所需地图和包元数据，再导入对应 PNG（字体还需要 `.fnt` 与图集）。可以直接复用或适配纯 JS 的地图与自动选片逻辑；不需要在手机上运行 Python、npm 或转换原包。

`tools/`、`maps/scripts/` 和两类 examples 目录是可选开发辅助文件；包中已有运行时输出，所以无需重新生成素材。在线试用不会保存文件、导出或持久化修改；它用内存代替浏览器存储，刷新后恢复初始示例，丢弃修改的原生确认被跳过。需要保存时使用下载包中的完整离线编辑器。素材标注的浏览器文件系统写入能力取决于浏览器，完整版本可使用导出元数据路径。

## 添加内容

1. 将原始素材、来源和许可证放入 `asset-conversion-examples/<包名>/`。
2. 按转换指南测量切片尺寸，区分 Dual、Edge、Wang、物体、动画和 UI。
3. 参考现有 `convert/` 脚本，用 `tools/tilemap.py` 的 `write_pack()` 输出新 `packs/<包名>/`；保留旧资源 UUID。
4. 运行索引命令，在源码编辑器中检查地形连接、立面、动画与图层遮挡，并打开旧地图检查兼容性。
5. 重建完整离线版和 Builda 预览，确认初始地图可加载后再发布。

## 常见问题和限制

- 地图提示缺少 UUID：恢复或加入地图使用的素材包，然后重建索引；不要用新 UUID 覆盖旧资源。
- 源码版直接双击打不开：ES modules 和 fetch 需要静态服务器；离线使用根目录单 HTML。
- 无法绘制：先长按再拖动，直接拖动默认平移。
- PixiJS 加载失败：检查网络、CDN 和 CSP；可改用 Canvas2D 或在项目内打包依赖。
- 大地图、多图层或大量高台可能占用较多内存；尺寸上限不代表所有移动设备都能流畅运行。
- 编辑器界面主要为中文；地图格式为本项目自定义，并非 Tiled TMX。
- 复用第三方素材时请检查原素材目录中的许可证及署名要求；未提供统一的项目代码许可证。
