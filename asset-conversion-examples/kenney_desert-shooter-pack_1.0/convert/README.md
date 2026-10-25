# Kenney Desert Shooter 转换工具

此文件夹保存转换代码与辅助数据；上一级是原始素材包的工程内副本，外部原包保持不变。

- `convert_kenney.py`：完整转换地形、物体、动画、UI、字体和声音。
- `wang_terrain.py`：Wang 地形转换，由主脚本调用。
- `convert_interface.py`：单独转换 UI 元素和位图字体。
- `object-labels.json`：物体中文名称映射。

需要 Python 3 和 Pillow。以下命令在工程根目录执行；省略源路径时使用本目录的上一级，默认输出到 `packs/kenney-desert/`，也可用 `--out` 指定其他目录。

```sh
python3 asset-conversion-examples/kenney_desert-shooter-pack_1.0/convert/convert_kenney.py
# 只更新 UI 和字体
python3 asset-conversion-examples/kenney_desert-shooter-pack_1.0/convert/convert_interface.py
```

完整转换会重建生成图集及 Wang 标注；保留手动标注时不要覆盖现有输出，可先用 `--out` 转换到临时目录。直接读取原素材包的 PNG 和 Sounds，不依赖或生成 source、qa 目录。像素覆盖等校验在内存中完成。运行素材包只含 `pack.meta`、`terrains/`、`objects/`、`ui/` 、`fonts/` 和 `sounds/`；不生成 source、qa、License 或 README。许可文件保留在原素材包根目录。通用验证、素材索引与离线构建工具继续放在工程公共工具目录。

声音保持原始 OGG 文件不转码，定义位于对应 `.ogg.meta` 文件，由 `pack.meta` 索引，离线构建也会收录。

每个资源旁输出 `<文件名>.meta`，由 `tools/tilemap.py` 统一读写。`pack.meta` 仅保留包级设置与元数据路径索引，不再生成 pack.json 或 ui/ui.json。

精简格式：pack.meta 的 version 为 2；相邻 .meta 直接存非默认属性，无 data 包装，省略可推导的名称、类别和资源路径。Wang 四边标签由九宫标注推导，保持图集 ID 以校验保存目标。

分组统一放在 `pack.meta` 的 `groups` 中（组名 → 资源相对路径列表），单个素材不存 `group`；地形元数据不保存 `colors`，图层缩略图直接使用实际地形图像渲染。

每个资源的 `.meta` 必须保存唯一 `uuid`。转换保留已有 UUID；首次转换按包 ID 与资源路径生成 UUID，此后重命名时随 `.meta` 一起移动，不能重新分配。地图格式 v2 的 `layers[].cells` 为逐格字符组成的字符串，assetMap 保存字符 → 素材 UUID 的映射（`.` 对应 null），`layers[].objects[].id` 为 assetMap 中的映射字符，不保存顶层 terrains/objects 对照表。

地图坐标从 0 开始，Wang 键为 `x_y`（如 `1_1`）；`cells[y * width + x]` 与同一坐标对应。

`links` 使用明文字符串，每格一个十六进制字符 0–9、a–f，表示 0–15 的四方向连接位，按从左到右、从上到下排列，与 cells 顺序一致。

`assetMap` 放在每个图层的第一个属性，统一供 cells 与 objects[].id 使用；只保存本层引用的素材和空格标记。

Wang 元数据采用紧凑存储：`labels` 定义标签顺序，`labelColors` 按同一顺序保存颜色。`tiles` 按图集格子顺序保存 `[地块ID, 九宫字符串, 可选权重]`，例如 `["source-0090","000011011"]`。九宫字符串从左到右、从上到下共 9 字符，字符表为 `0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_`，对应 labels 下标；`.` 表示未标注。权重默认为 1，仅非默认值写入第三项。空白占位为 `null`，加载时按所在位置恢复；不改变图集位置。含额外属性或仅四边标注的地块仍可使用完整对象。浏览器与 Python 共用相同规则，运行时恢复完整对象，标注保存重新压缩。

Wang 紧凑地块 ID：形如 `source-0090` 的来源编号在磁盘中写为坐标字符串 `"0_5"`，加载时恢复原 ID；自定义 ID 保持字符串。
