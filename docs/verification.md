# 验证记录 —— dsh-session-row-actions

## 2026-11-13（DSH 0.2.2-rc.2）

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

## 2026-10-23

- 自检 `node test/client-half-test.mjs`：工厂 / 行插槽 / 插件页两个列表 / 勾选 /
  排序 / 分叉权限 / v1 迁移 全部通过。
- 隔离 profile + 真实浏览器：配置区块两个列表渲染正常，勾选与排序即时生效，
  悬浮条按配置渲染（默认「归档」「分叉」）；右键打开官方菜单五项齐全。
