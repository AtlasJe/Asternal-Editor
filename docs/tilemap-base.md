# Tilemap 及编辑器

浏览器中的像素风地图编辑器，支持 Dual 四角占用、Edge 四边连接、Wang 地形、多图层、带高度地形、物体与动画。提供 Canvas2D 和 PixiJS 两套渲染实现。

## 使用

直接打开 [地图编辑器.html](地图编辑器.html)，无需服务器或网络。

开发时，在项目根目录启动静态服务器：

```sh
python3 -m http.server 8000
```

打开 [Canvas2D 版](http://localhost:8000/web/) 或 [PixiJS 版](http://localhost:8000/pixi/)；PixiJS 版需要联网加载依赖。绘制需先长按，再拖动；直接拖动用于平移地图。

## 扩充素材

可以把这个项目交给 AI 编程助手，通过以下方式添加素材：

- **转换已有素材包**：向 AI 上传类似的像素风素材包，让它参考[素材包转换指南](asset-conversion-examples/README.md)和现有转换示例，分析、切片并整理成编辑器可用的 `packs/<pack-id>/` 结构，生成素材元数据和 UUID。
- **让 AI 编写程序绘图**：描述需要的地形、物体或 UI，让 AI 参考[图片生成示例](image-generation-examples/README.md)，编写 Python/Pillow 等绘图程序生成图片，按编辑器的图集布局组装，并配好元数据。

例如：“把我上传的素材包转换成这个编辑器能用的素材，保留原始文件和许可证”，或“参考现有城墙示例，用程序绘制一套可自动连接的冰墙素材”。完成后更新素材索引并重建离线版（命令见下文），即可在编辑器中使用。

## 目录

| 目录 | 内容 |
| --- | --- |
| `web/`、`pixi/` | 两套渲染器入口 |
| `shared/` | 编辑器、地图模型、地形算法和界面 |
| `packs/` | 运行时素材包及索引 |
| `maps/` | 示例地图和地图生成脚本 |
| [image-generation-examples/](image-generation-examples/README.md) | 图片绘制示例，生成图片放在其 `temp/` 下 |
| [asset-conversion-examples/](asset-conversion-examples/README.md) | 素材包转换指南、原始素材和转换示例 |
| [tools/](tools/README.md) | 素材元数据、索引和离线构建工具 |

## 构建

需要 Python 3、Node.js/npm；图片生成与素材转换还需要 Pillow。在项目根目录运行：

```sh
python3 tools/tilemap.py index
python3 tools/tilemap.py build
```

输出为 `地图编辑器.html`，可用 `--out <文件路径>` 指定位置。更多参数见 [工具说明](tools/README.md)。

地图通过 UUID 引用素材。更新资源时保留已有 UUID，并同步重建素材索引和离线版。

## 数据、接入与扩展

完整说明见 [接入与发布指南](docs/integration.md)，包括地图与素材格式、PixiJS 接入示例、移动端使用路径、新素材扩展和常见问题。

Builda 在线试用版本通过 `python3 tools/build-builda-preview.py` 生成到 `builda-preview/index.html`。它使用 Canvas2D，无外部 CDN，存储仅保存在内存，保存和导出不可用；完整离线编辑器不受此限制。
