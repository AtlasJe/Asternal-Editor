# 图片生成示例

使用 Python 3、Pillow 和 Node.js。两个绘制脚本无需原始素材，遵循本项目 `shared/config.json` 的图集布局。

| 脚本 | 内容 | 输出图集 |
| --- | --- | --- |
| [make_dual_plateau.py](make_dual_plateau.py) | Dual 四角占用；2 格高的圆角矩形苔石高台，南墙和墙脚跟随圆角，对角顶面分离 | `moss_plateau.png`，128×384 |
| [make_wall.py](make_wall.py) | Edge 四边连接；1 格高的城墙，含端头、转角、丁字口、十字口 | `city_wall.png`，128×256 |
| [create_terrain_demo.mjs](create_terrain_demo.mjs) | 共用的地图与离线演示生成入口 | `.tilemap` 地图与 HTML 演示页 |

## 生成素材

```sh
python3 image-generation-examples/make_dual_plateau.py
python3 image-generation-examples/make_wall.py
```

图集和预览图默认生成在脚本目录下的 `image-generation-examples/temp/` 文件夹。可用 `--out <图集目录>`、`--review <预览目录>` 指定其他位置；从任意工作目录调用均可。

模块都提供 `generate(out, review)`，小镇转换脚本复用同一份绘制实现。首次生成完整素材包及元数据时运行：

```sh
python3 asset-conversion-examples/kenney_tiny-town/convert/convert_tiny_town.py
```

## 生成演示

```sh
node --experimental-default-type=module image-generation-examples/create_terrain_demo.mjs
```

默认生成两个示例，也可传入 `wall` 或 `dual` 只生成其中一个。脚本读取小镇包，生成地图并调用 `tools/tilemap.py build` 打包演示，无需先构建根目录离线版。

| 示例 | 原生地图 | 可双击打开的离线页面 |
| --- | --- | --- |
| Edge 城墙 | `maps/城墙验收.tilemap` | `image-generation-examples/temp/city-wall-demo.html` |
| Dual 高台 | `maps/Dual高台验收.tilemap` | `image-generation-examples/temp/dual-plateau-demo.html` |

同目录的 `city-wall-editor.png`、`dual-plateau-editor.png` 是浏览器验收截图，生成脚本不会刷新截图。`image-generation-examples/temp/moss_plateau_single.png` 是四块实际 Dual 裁片组合的单格放大图。

运行测试见 [tests/README.md](../tests/README.md)。地形状态、高度和元数据约定见 [素材包转换指南](../asset-conversion-examples/README.md)。
