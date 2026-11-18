# 设计文档 —— dsh-session-row-actions

> 面向维护者；用户文档见 [README.md](../README.md)。

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
