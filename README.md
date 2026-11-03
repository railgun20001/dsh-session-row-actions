# dsh-session-row-actions —— 会话行悬浮按钮

把侧栏会话行悬停时行尾那排按钮变成**可配置的一排**：官方「…」菜单里的每个动作
都能勾选成悬浮按钮，并按自己的顺序排列。

```
悬停一行会话  →   （…）  归档会话  分叉会话        ← 默认：只勾了「归档」「分叉」
在行上右键    →   官方「…」菜单（置顶 / 重命名 / 分叉 / 归档 / 复制 Session ID）
```

## 配置在哪

**插件管理 → 会话行悬浮按钮**（本插件详情页），不在「设置 → 通用」。

界面是两个列表，**各自独立排序**：

| 列表 | 内容 | 操作 |
| --- | --- | --- |
| **悬浮按钮** | 第一行固定是「更多（…）」，其余是已勾选的动作（= 悬停时实际显示的那排） | 「更多」只可切显隐；其余可拖动排序、取消勾选即移出 |
| **更多菜单** | 其余动作：置顶 / 重命名 / 分叉 / 归档 / 复制 Session ID（不含「更多」） | 勾选即加入悬浮按钮；拖动只影响这个列表 |

要点：

- **「更多（…）」位置固定**：永远排在悬浮列表第一行、也永远在悬浮条最前，不能拖动也不能移除，
  只有勾选框控制显隐（单独存为 `moreVisible`）。它下面写明「在会话行上点右键也能打开菜单」。
- **两个列表的顺序互不干扰**：数据上各有各的数组（`hoverOrder` / `menuOrder`），
  拖动一个不会改动另一个。
- 勾选时按 `menuOrder` 的相对位置插入 `hoverOrder` —— 所以菜单列表的顺序决定新勾选项
  默认落在悬浮条的哪个位置，之后可以再拖。
- 菜单列表的排序不会改变系统自带菜单的排列。

## 实现方式

| 需求 | 手段 | 为什么 |
| --- | --- | --- |
| 自定义这一排按钮 | 注入样式隐藏官方插槽条目（`> button:not([data-sra])`），由本插件按配置渲染整排 | 官方条目位置由各自 `order` 固定，无法按用户顺序重排，也无法把菜单项提升为按钮 |
| 隐藏官方「更多」 | 把官方 Menu 触发器收成 0 宽、`pointer-events: none`，保留在流里 | 它是官方行组件自绘的，不是插槽条目；保留在流里是为了给菜单当锚点（右键与「更多」按钮都靠它定位） |
| 右键打开菜单 | `window` 捕获 `mouseup`（button 2）→ 点官方触发器；`contextmenu` 只压原生菜单 | 实测真实右键的 `contextmenu` 在本应用页面里不一定送达；动作放 `mouseup` 还避开了「菜单刚弹出就被遮罩关掉」的竞态 |
| 置顶 / 重命名 | 打开官方菜单 → 点对应条目（点之前给 `body` 打 `data-sra-busy`，把菜单临时设为透明） | `uiWorkspace` 只暴露分叉 / 归档 / 取消归档 / 打开会话，**没有**置顶和重命名；复用官方条目才能保留确认弹窗与行内重命名输入框 |
| 分叉 / 归档 / 复制 ID | 直接调服务：`uiWorkspace.forkSession`、`archiveSession` / `unarchiveSession`、`navigator.clipboard` | 这些有公开契约，原生调用最稳；归档/取消归档按官方按钮文案判断当前方向 |
| 配置区块 | keyed 插槽 `plugins.bundle.config`，key = 本包名 | 官方插件管理页会在本插件详情页自动渲染该区块（判据 `ledger.bundles.has(pkg.name)`） |
| 偏好存储 | localStorage `dsh-session-row-actions/prefs-v4`（`{ menuOrder, hoverOrder, moreVisible }`）+ 订阅广播 | 客户端模块插件拿不到宿主 Config；改完即时生效、无需重启。v3 / v2 / v1 的旧数据会自动迁移 |

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
client.js   客户端半：样式 / 右键 / 一排按钮 / 两个可拖拽列表
cordis.patch.yml
locale/{zh,en}.json
icon.svg
test/client-half-test.mjs   桩测试：node test/client-half-test.mjs
```

不 import 任何 Harness 客户端包：图标、按钮、列表、勾选框都自己写，只依赖
`--dsw-alias-*` 主题令牌与 `data-slot` / `[role="menu"]` 这类稳定标记。

## 验证记录（2026-10-23）

- 自检 `node test/client-half-test.mjs`：工厂 / 行插槽 / 插件页两个列表 / 勾选 /
  排序 / 分叉权限 / v1 迁移 全部通过。
- 隔离 profile + 真实浏览器：配置区块两个列表渲染正常，勾选与排序即时生效，
  悬浮条按配置渲染（默认「归档」「分叉」）；右键打开官方菜单五项齐全。

