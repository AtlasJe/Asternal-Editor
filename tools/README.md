# 项目工具

共用工具合并为两个文件，分别供 Python 和 Node.js 使用。图片生成示例见 [image-generation-examples/](../image-generation-examples/README.md)。

| 文件 | 用途 |
| --- | --- |
| `tilemap.py` | 素材元数据读写、UUID 管理、Wang 编解码、素材索引和离线构建 |
| `tilemap.mjs` | Node 脚本共用的素材包读取入口，复用 `shared/pack-meta.js` 的解析逻辑 |

```sh
python3 tools/tilemap.py index
python3 tools/tilemap.py build
python3 tools/tilemap.py build --out dist/tilemap.html
python3 tools/tilemap.py build --startup-map maps/城墙验收.tilemap --out dist/wall.html
```

`index` 更新 `packs/index.json`。`build` 默认生成根目录 `地图编辑器.html`；`--startup-map` 只更换本次输出内嵌的初始地图。

Python 转换脚本通过 `from tilemap import read_pack, write_pack, asset_uuids` 复用同一份实现；Node 脚本从 `tools/tilemap.mjs` 导入 `readPack`。无需单独的 Wang 编码或构建辅助模块。
