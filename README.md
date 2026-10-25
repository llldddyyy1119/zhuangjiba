# 装机霸 zhuangjiba

> 3D 智能装机推荐网站 —— 说需求，出配置，3D 看得见

**在线体验：[llldddyyy1119.github.io/zhuangjiba](https://llldddyyy1119.github.io/zhuangjiba/)**

## ✨ 功能特性

- **智能推荐**：预算 / 使用场景 / 选购优先 / 主机类型 / 特殊需求 / 品牌倾向 / 硬件侧重 共 7 组筛选标签，一键生成「性价比 · 均衡 · 性能」三套个性化方案，附匹配度评分、预算分配解析、瓶颈判断与帧率预估
- **3D 装机**：整机 3D 实时渲染 —— 拖拽旋转、爆炸视图、点击配件直接换件；ARGB 双圈风扇、霓虹灯线、辉光（Bloom）后处理
- **真实模型**：显卡 / CPU 采用开源 GLB 实体模型；主板（电路走线纹理、PCIe 金手指、VRM 鳍片）、内存（金属马甲）、机箱（蜂窝网孔）、电源（模组线缆）为程序化工业建模
- **兼容性检查**：CPU 接口、内存代数、显卡限长、散热限高、冷排支持、功耗余量、主板规格等 9 项检查；不兼容配件自动置灰并标注原因
- **本土配件库**：110 款国内市场 SKU，大众 + 小众全覆盖（七彩虹 / 微星 / 蓝宝石 / 摩尔线程 / 金百达 / 梵想 / 玩嘉 / RX 6750 GRE 国内特供 等）

## 🚀 本地运行

需要 Python 3（无需构建、无需联网）：

```bash
cd zhuangjiba
python -m http.server 8123
# 浏览器打开 http://127.0.0.1:8123
```

Windows 用户可直接双击 `启动网站.bat`。

## 🧱 技术栈

纯静态站点：HTML + CSS + 原生 JavaScript + [Three.js r164](https://threejs.org)（已本地化到 `libs/`，断网可用，零依赖安装）

## 📁 目录结构

```
zhuangjiba/
├── index.html          # 单页入口（智能推荐 / 3D 装机 / 配置单 三视图）
├── css/style.css       # 石墨灰+香槟金 高级简约主题
├── js/
│   ├── data.js         # 配件数据库（110 SKU）+ 筛选标签 + 场景权重
│   ├── recommend.js    # 推荐引擎（预算分配 / 降级收敛 / 兼容检查）
│   ├── scene3d.js      # 3D 场景（参数化建模 + GLB 模型 + Bloom）
│   └── app.js          # 交互逻辑（筛选 / 抽屉换件 / 配置单导出）
├── libs/               # Three.js 及官方组件（本地化）
├── models/             # 3D 模型与许可说明
└── 启动网站.bat         # Windows 一键启动
```

## 📦 3D 模型许可

CPU / 显卡实体模型来自开源项目 [strata-pc-simulator](https://github.com/PiccataPro/strata-pc-simulator)（MIT License），署名详见 [models/README.md](models/README.md)；其余配件为程序化参数建模。

## 🔧 自定义

- **增删配件 / 改价格**：编辑 `js/data.js`（每条一个对象，分钟级上手）
- **整站配色**：改 `css/style.css` 顶部 CSS 变量
- **换 3D 模型**：GLB 放入 `models/`，在 `js/scene3d.js` 的 `MODEL_FILES` 表加一行映射

## 🗺️ 路线图

- [ ] 绑定独立域名（zhuangjiba.cn）
- [ ] 接入更多真实 3D 模型（主板 / 水冷 / 机箱）
- [ ] 配置单分享链接
- [ ] 配件实时价格
- [ ] 手机端适配优化

## License

MIT
