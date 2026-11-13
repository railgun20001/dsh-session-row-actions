# dsh-session-row-actions —— 会话行悬浮按钮

把侧栏会话行悬停时行尾那排按钮变成**可配置的一排**：官方「…」菜单里的每个动作
都能勾选成悬浮按钮，并按自己的顺序排列。

```
悬停一行会话  →   （…）  归档会话  分叉会话        ← 默认：只勾了「归档」「分叉」
在行上右键    →   官方「…」菜单（0.2.2+ 原生支持，插件让位；旧版由插件兼容桥打开）
```

## 配置在哪

**插件管理 → 会话行悬浮按钮**（本插件详情页），不在「设置 → 通用」。

界面是两个列表，**各管各的事**：

| 列表 | 内容 | 操作 |
| --- | --- | --- |
| **悬浮按钮** | 第一行固定是「更多（…）」，其余是已勾选的动作（= 悬停时实际显示的那排） | 「更多」只可切显隐；其余可拖动排序、取消勾选即移出 |
| **更多菜单** | 其余动作，按官方菜单分组固定展示：置顶 / 重命名 / 分叉 / 复制 Session ID / 归档（不含「更多」） | **只可勾选**，不可拖动 |

要点：

- **「更多（…）」位置固定**：永远排在悬浮列表第一行、也永远在悬浮条最前，不能拖动也不能移除，
  只有勾选框控制显隐（单独存为 `moreVisible`）。它下面写明「在会话行上点右键也能打开菜单」；
  0.2.2+ 这是官方原生能力，旧版由插件的兼容桥提供。
- **两个列表互不干扰**：数据上各有各的数组（`hoverOrder` / `menuOrder`），
  拖动上面的列表不会改动下面的；下面的列表已按官方分组固定，不再提供拖动。
- 勾选时按固定分组顺序插入 `hoverOrder` —— 所以「更多菜单」列表决定新勾选项
  默认落在悬浮条的哪个位置，之后可以再到上面的列表拖。
- **这个列表不改变官方「…」菜单的排列**：0.2.2+ 官方菜单由 `ctx.contextMenus`
  的结构化贡献按 order + 分割线分组渲染，插件不参与；列表只借用同样的分组顺序
  方便定位动作。官方菜单的显示顺序不受本插件配置影响。

## 实现方式

| 需求 | 手段 | 为什么 |
| --- | --- | --- |
| 自定义这一排按钮 | 注入样式隐藏官方插槽条目（`> :not(.sra-group)`），由本插件按配置渲染整排 | 官方条目位置由各自 `order` 固定，无法按用户顺序重排，也无法把菜单项提升为按钮；新版条目可能带 Tooltip 包裹层，不能只匹配 `> button` |
| 隐藏官方「更多」 | 新版用 `[data-context-menu-trigger]` 直接隐藏（规则限定会话行，不影响工作区标题）；旧版仍把触发器收成 0 宽留在流里当锚点 | 0.2.2+ 的官方触发器是 `rowActions` 的直接子按钮，旧版 `> span > button` 规则匹配不到，导致「更多」重复出现 |
| 右键打开菜单 | **0.2.2+ 完全交给官方**：会话行自带 `getTriggerProps(...).onContextMenu`；插件只在识别到旧版 DOM 时接管 | 官方已原生支持右键打开同一份菜单；插件的全局 `mouseup` 模拟点击反而会吞掉或重复打开菜单 |
| 置顶 / 重命名 / 归档 | 优先 `ctx.contextMenus.resolve(target)` → 等 `ready` → 按官方动作 id `select()`；旧版回退 DOM 桥 / `uiWorkspace` | 新版菜单改为结构化贡献，按 DOM 下标点 `[role=menuitem]` 会因权限/分隔线错位；走服务能复用官方方向判断、确认弹窗与通知 |
| 分叉 / 复制 ID | 直接调服务：`uiWorkspace.forkSession`、`navigator.clipboard` | 这些有公开契约，原生调用最稳；本插件保留「分叉后打开子会话」的既有行为 |
| 本插件的「更多」 | `contextMenus.open(target, { x, y })` 按按钮下边缘定位；按钮也带 `data-context-menu-trigger` | 新版不再靠 0 宽官方触发器算锚点；带标记能让官方 Menu 把它认作合法外部触发器，弹出后不会被 outside 监听立刻关掉 |
| 配置区块 | keyed 插槽 `plugins.bundle.config`，key = 本包名 | 官方插件管理页会在本插件详情页自动渲染该区块（判据 `ledger.bundles.has(pkg.name)`） |
| 偏好存储 | localStorage `dsh-session-row-actions/prefs-v4`（`{ menuOrder, hoverOrder, moreVisible }`）+ 订阅广播 | 客户端模块插件拿不到宿主 Config；改完即时生效、无需重启。`menuOrder` 固定按官方分组规整，v3 / v2 / v1 的旧数据会自动迁移 |

## 两条插槽契约（踩过的坑）

- **插槽必须先声明**：`sidebar.workspaces.session.row.action` 由 ui-workspace 在侧栏
  挂载时才声明，插件 apply 时它还不存在。直接 `ctx.slots.register` 会抛
  `slot "…" is not declared`，导致 `web boot: 1 entry did not activate`、整窗起不来。
  必须走 `ctx.slots.inject(SLOT, …)`。
- **同 id 必须换优先级**：若要用和官方相同的单元格 id，必须换一个优先级
  （`priority: -1`，最低者渲染）才能遮蔽官方条目。本版改用独立 id（`sra-actions`）
  + 样式隐藏官方条目，不再需要遮蔽。

所有注册都包在 try/catch 里：失败只记日志、丢掉那一项，绝不让 apply 抛错。

## 结构

```
index.js    宿主半占位（apply 为空）
client.js   客户端半：样式 / 新旧右键兼容 / 官方菜单服务 / 一排按钮 / 悬浮列表 + 固定分组菜单列表
cordis.patch.yml
locale/{zh,en}.json
icon.svg
test/client-half-test.mjs   桩测试：工厂 / 行插槽 / 配置页 / 新版菜单服务 / 右键让位 / 旧版兼容 / 官方分组固定列表
```

不 import 任何 Harness 客户端包：图标、按钮、列表、勾选框都自己写，只依赖
`--dsw-alias-*` 主题令牌，以及 `data-slot` / `data-context-menu-trigger` 这类稳定
DOM 标记与 `ctx.contextMenus` 服务。

## 验证记录

### 2026-11-13（DSH 0.2.2-rc.2）

- 根源：新版会话行的官方「…」变成 `rowActions` 的直接子按钮，旧 CSS
  `> span > button` 失效，于是出现两组「…」；旧版全局 `mouseup` 模拟点击还会
  与官方新增的右键手势打架。
- 对照当前安装版源码核对：`ui-workspace/src/client/rows/Rows.tsx`（行尾 DOM）、
  `ui-context-menu/src/client/{trigger,Button,View,registry}.ts`（官方右键 / 结构化菜单）、
  `ui-workspace/src/client/session-actions/context-menus.tsx`（动作 id）。
- 真实浏览器用 `buildCss()` 生成的规则复验：新版官方触发器隐藏、官方插槽条目
  （含 Tooltip 包裹层）隐藏、本插件按钮可见、旧版官方触发器收起、工作区标题
  的「…」不受影响。
- 自检 `npm test`：工厂 / 行插槽 / 新旧隐藏规则 / `contextMenus.open` 坐标 /
  `resolve().select(id)` / 新版右键让位 / 服务未激活时的新版 DOM 让位 / 旧版右键
  兼容 / 官方分组固定菜单（不可拖动、旧乱序偏好自动规整）/ 固定「更多」/
  两个列表独立排序 / 勾选 / 权限 / v3、v2、v1 迁移 全部通过。
- 未做：当前 DSH Web 页面需要鉴权，未在真实插件页面里做肉眼验收；安装后建议在
  侧栏悬停会话行、点本插件「…」、右键会话行各试一次。

### 2026-10-23

- 自检 `node test/client-half-test.mjs`：工厂 / 行插槽 / 插件页两个列表 / 勾选 /
  排序 / 分叉权限 / v1 迁移 全部通过。
- 隔离 profile + 真实浏览器：配置区块两个列表渲染正常，勾选与排序即时生效，
  悬浮条按配置渲染（默认「归档」「分叉」）；右键打开官方菜单五项齐全。

