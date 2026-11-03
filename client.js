/**
 * dsh-session-row-actions —— 客户端半（浏览器 bundle 的 factory 体）。
 *
 * 把侧栏会话行悬停时行尾那排按钮变成**可配置的一排**：
 *
 *   - 官方「…」菜单里的每个动作（置顶 / 重命名 / 分叉 / 归档 / 复制 Session ID）
 *     都可以被「勾选」成悬浮按钮，并按自己的顺序排列；
 *   - 「更多（…）」本身也是其中一项，勾选它才会在悬浮条上出现「…」；
 *   - 配置界面在 插件管理 → 本插件详情页：两个列表（悬浮按钮 / 更多菜单），
 *     都能拖动排序，勾选状态共享同一份数据。
 *
 * ## 数据模型（只有一份顺序，两个视图）
 *
 * ```ts
 * { order: ActionKey[], shown: Record<ActionKey, boolean> }
 * ```
 *
 * 「更多菜单」列表 = `order`（全量，带勾选框）；「悬浮按钮」列表 =
 * `order.filter(k => shown[k])`。拖动任一列表都会改写 `order`：
 * 在悬浮列表里拖动，只重排「已勾选」的那几个占用的位置，未勾选项原地不动。
 *
 * ## 为什么自己渲染这一排按钮
 *
 * 官方那排按钮是插槽条目（`archive` / `pin`），位置由各自的 `order` 固定，
 * 无法按用户顺序重排，也无法把菜单项提升为按钮。所以这里用一条注入样式把
 * 官方条目隐藏（`> button:not([data-sra])`），再由本插件按配置渲染整排按钮。
 *
 * ## 动作如何执行
 *
 * `uiWorkspace` 只暴露了分叉 / 归档 / 取消归档 / 打开会话；**没有**置顶和重命名。
 * 因此：
 *   - 分叉、归档（按官方按钮文案判断归档还是取消归档）、复制 Session ID 走原生服务；
 *   - 置顶、重命名走「打开官方菜单 → 点对应条目」，完整复用官方行为（确认弹窗、
 *     行内重命名输入框）。打开的那一帧用 `body[data-sra-busy]` 把菜单设为透明，
 *     避免闪一下。
 *
 * ## 契约与踩坑（违反任意一条整个页面都会起不来）
 *
 *   - 插槽必须先声明：`sidebar.workspaces.session.row.action` 由 ui-workspace 在侧栏
 *     挂载时才声明，apply 时还不存在，直接 register 会抛 `slot "…" is not declared`，
 *     所以统一走 `ctx.slots.inject(SLOT, …)`。
 *   - 任何注册失败只记日志、不向外抛：按钮是装饰性的，契约再变应该是「按钮不出现」，
 *     而不是「整个页面起不来」。
 *
 * 不 import 任何 Harness 客户端包：图标、按钮、列表、勾选框都自己写，只依赖
 * `--dsw-alias-*` 主题令牌与 `data-slot` / `[role="menu"]` 这类稳定标记。
 *
 * @module dsh-session-row-actions/client
 */

window.__ModuleLoader__.load({
  id: 'dsh-session-row-actions',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const react = require('react')
    const h = react.createElement

    /** 包名：日志、样式标签、localStorage 键前缀都用它。 */
    const PKG = 'dsh-session-row-actions'
    /** 文案命名空间：与插槽注册的 `locale` 选项同名，组件因此拿到绑定好的 `t`。 */
    const NS = 'session-row-actions'
    /** 目标插槽：会话行尾部的悬浮按钮条。 */
    const SLOT = 'sidebar.workspaces.session.row.action'
    /** 该插槽在 DOM 里的稳定标记（renderSlot 会写 `data-slot`）。 */
    const SLOT_SELECTOR = '[data-slot="sidebar.workspaces.session.row.action"]'
    /** 整条按钮条的类名（CSS Modules 形如 `hIlkoa_rowActions`，用子串匹配）。 */
    const STRIP_SELECTOR = '[class*="rowActions"]'
    /** 插件管理详情页里「本插件自己的配置区块」插槽（keyed，key = 包名）。 */
    const BUNDLE_CONFIG_SLOT = 'plugins.bundle.config'
    /** 本插件在行按钮插槽里的单元格 id（与官方 id 不冲突）。 */
    const CELL_ID = 'sra-actions'
    /** 分叉需要的权限动作名，与官方菜单项判据一致。 */
    const FORK_ACTION = 'session/fork'
    /**
     * 偏好存储键（v4）。
     *
     * 形状：`{ menuOrder, hoverOrder, moreVisible }`
     *   - `hoverOrder`：悬浮条里「除『更多』以外」的动作顺序；
     *   - `moreVisible`：「更多（…）」是否显示 —— 它在悬浮列表里位置固定（永远第一），
     *     既不能拖动也不能移除，只能切显隐，所以单独用一个布尔存。
     */
    const PREFS_KEY = `${PKG}/prefs-v4`
    /** v3 键（`{ menuOrder, hoverOrder }`），仅用于一次性迁移。 */
    const LEGACY_V3_KEY = `${PKG}/prefs-v3`
    /** v2 键（`{ order, shown }`），仅用于一次性迁移。 */
    const LEGACY_V2_KEY = `${PKG}/prefs-v2`
    /** v1 键（四个布尔开关），仅用于一次性迁移。 */
    const LEGACY_PREFS_KEY = `${PKG}/prefs-v1`

    /** 全部可配置动作（用于数据规整：任何历史数据都要补齐这些 key）。 */
    const ACTION_KEYS = ['more', 'pin', 'rename', 'fork', 'archive', 'copyId']

    /** 「更多」在悬浮列表里位置固定，单独处理，不参与 `hoverOrder`。 */
    const MORE_KEY = 'more'

    /**
     * 默认顺序：先把常用的「归档」「分叉」排在前面（沿用改造前那排按钮的观感），
     * 「更多」在最前、其余动作按官方菜单的相对次序跟在后面。
     */
    const DEFAULT_ORDER = ['more', 'archive', 'fork', 'pin', 'rename', 'copyId']

    /** 默认悬浮条：只有「归档」「分叉」（「更多」默认隐藏，延续之前的观感）。 */
    const DEFAULT_HOVER = ['archive', 'fork']

    /** 每个动作的文案键与图标。 */
    const ACTION_META = {
      more: { title: 'action.more', hint: 'action.more.hint' },
      pin: { title: 'action.pin', hint: 'action.pin.hint' },
      rename: { title: 'action.rename', hint: 'action.rename.hint' },
      fork: { title: 'action.fork', hint: 'action.fork.hint' },
      archive: { title: 'action.archive', hint: 'action.archive.hint' },
      copyId: { title: 'action.copyId', hint: 'action.copyId.hint' },
    }

    /** 简体中文字典（键集基准）。 */
    const zh = {
      'config.desc': '把「更多」菜单里的动作勾选成悬浮按钮，并拖动排好顺序；改动立即生效。',
      'section.hover': '悬浮按钮',
      'section.hover.hint': '悬停会话行时显示的按钮；「更多」固定在最前，其余可拖动排序',
      'section.menu': '更多菜单',
      'section.menu.hint': '勾选后加入悬浮按钮；拖动只影响这个列表，两个列表互不干扰',
      'item.fixed': '位置固定，不可拖动',
      'item.drag': '拖动排序',
      'action.more': '更多（…）',
      'action.more.hint': '固定显示在悬浮列表最前，只可切换显隐；在会话行上点右键也能打开菜单',
      'action.pin': '置顶会话',
      'action.pin.hint': '置顶 / 取消置顶',
      'action.rename': '重命名',
      'action.rename.hint': '重命名会话标题',
      'action.fork': '分叉会话',
      'action.fork.hint': '从最后一个完成轮次创建分支',
      'action.archive': '归档会话',
      'action.archive.hint': '归档 / 取消归档',
      'action.copyId': '复制 Session ID',
      'action.copyId.hint': '把会话 ID 复制到剪贴板',
      'common.copied': '已复制 Session ID',
    }

    /** 英文字典。 */
    const en = {
      'config.desc': 'Tick actions from the “More” menu to turn them into hover buttons, then drag to order them. Changes apply immediately.',
      'section.hover': 'Hover buttons',
      'section.hover.hint': 'Shown while hovering a session row — “More” stays first, the rest can be dragged',
      'section.menu': 'More menu',
      'section.menu.hint': 'Tick to add to the hover buttons; dragging only affects this list — the two lists are independent',
      'item.fixed': 'Fixed position — cannot be dragged',
      'item.drag': 'Drag to reorder',
      'action.more': 'More (…)',
      'action.more.hint': 'Always first in the hover list, only its visibility toggles; right-clicking a row opens the menu too',
      'action.pin': 'Pin session',
      'action.pin.hint': 'Pin / unpin',
      'action.rename': 'Rename',
      'action.rename.hint': 'Rename the session title',
      'action.fork': 'Fork session',
      'action.fork.hint': 'Branch from the last completed turn',
      'action.archive': 'Archive session',
      'action.archive.hint': 'Archive / unarchive',
      'action.copyId': 'Copy Session ID',
      'action.copyId.hint': 'Copy the session id to the clipboard',
      'common.copied': 'Session ID copied',
    }

    /**
     * 建一个带订阅的偏好存储：读写 localStorage，写入后同步通知订阅者。
     *
     * 形状：`{ menuOrder: ActionKey[], hoverOrder: ActionKey[], moreVisible: boolean }`。
     * 两个列表各自独立排序；`hoverOrder` 只存「除『更多』以外」的动作，
     * 「更多」的显隐单独用 `moreVisible`（它在列表里位置固定、不可移除）。
     *
     * 读取时做一次规整（未知 key 丢弃、缺失 key 补默认），并兼容 v3 / v2 / v1 的历史形状。
     *
     * @returns 带 get / set / subscribe 的存储对象。
     */
    function createPrefs() {
      /** 把任意数组规整成「只含已知 key、且不缺项」的顺序。 */
      const normalizeOrder = (input) => {
        const order = Array.isArray(input) ? input.filter((key) => ACTION_KEYS.includes(key)) : []
        for (const key of ACTION_KEYS) if (!order.includes(key)) order.push(key)
        return order
      }
      /** 悬浮列表只接受「非『更多』」的已知 key，去重保序。 */
      const normalizeHover = (input) => {
        const list = Array.isArray(input) ? input.filter((key) => ACTION_KEYS.includes(key) && key !== MORE_KEY) : []
        return [...new Set(list)]
      }

      let value = { menuOrder: DEFAULT_ORDER.slice(), hoverOrder: DEFAULT_HOVER.slice(), moreVisible: false }
      try {
        const raw = window.localStorage.getItem(PREFS_KEY)
        if (typeof raw === 'string' && raw.length > 0) {
          const parsed = JSON.parse(raw)
          if (parsed !== null && typeof parsed === 'object') {
            value = {
              menuOrder: normalizeOrder(parsed.menuOrder),
              hoverOrder: normalizeHover(parsed.hoverOrder),
              moreVisible: parsed.moreVisible === true,
            }
          }
        } else {
          // 迁移 v3：{ menuOrder, hoverOrder } —— hoverOrder 里可能混着「更多」
          const legacyV3 = window.localStorage.getItem(LEGACY_V3_KEY)
          const legacyV2 = window.localStorage.getItem(LEGACY_V2_KEY)
          const legacyV1 = window.localStorage.getItem(LEGACY_PREFS_KEY)
          if (typeof legacyV3 === 'string' && legacyV3.length > 0) {
            const old = JSON.parse(legacyV3)
            if (old !== null && typeof old === 'object') {
              const hover = Array.isArray(old.hoverOrder) ? old.hoverOrder : []
              value = {
                menuOrder: normalizeOrder(old.menuOrder),
                hoverOrder: normalizeHover(hover),
                moreVisible: hover.includes(MORE_KEY),
              }
            }
          } else if (typeof legacyV2 === 'string' && legacyV2.length > 0) {
            // 迁移 v2：{ order, shown }
            const old = JSON.parse(legacyV2)
            if (old !== null && typeof old === 'object') {
              const menuOrder = normalizeOrder(old.order)
              const shown = old.shown !== null && typeof old.shown === 'object' ? old.shown : {}
              value = {
                menuOrder,
                hoverOrder: normalizeHover(menuOrder.filter((key) => shown[key] === true)),
                moreVisible: shown[MORE_KEY] === true,
              }
            }
          } else if (typeof legacyV1 === 'string' && legacyV1.length > 0) {
            // 迁移 v1：hideMore/showArchive/showFork
            const old = JSON.parse(legacyV1)
            if (old !== null && typeof old === 'object') {
              const visible = new Set(DEFAULT_HOVER)
              if (old.showArchive === false) visible.delete('archive')
              if (old.showFork === false) visible.delete('fork')
              value = {
                menuOrder: DEFAULT_ORDER.slice(),
                hoverOrder: DEFAULT_ORDER.filter((key) => key !== MORE_KEY && visible.has(key)),
                moreVisible: old.hideMore === false,
              }
            }
          }
        }
      } catch (error) {
        console.warn(`[${PKG}] 读取偏好失败，使用默认值`, error)
      }

      const listeners = new Set()
      const persist = () => {
        try {
          window.localStorage.setItem(PREFS_KEY, JSON.stringify(value))
        } catch (error) {
          console.warn(`[${PKG}] 保存偏好失败（仅本次会话生效）`, error)
        }
      }
      return {
        get: () => value,
        set(patch) {
          value = { ...value, ...patch }
          persist()
          for (const listener of [...listeners]) {
            try {
              listener()
            } catch (error) {
              console.error(`[${PKG}] 偏好订阅者抛错`, error)
            }
          }
        },
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
      }
    }

    /**
     * 订阅偏好的 React Hook。
     *
     * @param prefs - 偏好存储。
     * @returns 当前偏好快照。
     */
    function usePrefs(prefs) {
      const [snapshot, setSnapshot] = react.useState(prefs.get)
      react.useEffect(() => prefs.subscribe(() => setSnapshot(prefs.get())), [prefs])
      return snapshot
    }

    /**
     * 取「当前该显示在悬浮条上的动作」：显隐开关打开的「更多」永远排第一，
     * 其余按 `hoverOrder`（与菜单列表的顺序无关）。
     *
     * @param snapshot - 偏好快照。
     * @returns 动作 key 数组。
     */
    function visibleActions(snapshot) {
      return snapshot.moreVisible === true ? [MORE_KEY, ...snapshot.hoverOrder] : snapshot.hoverOrder
    }

    /**
     * 生成注入到页面的样式表：隐藏官方触发器/官方条目 + 本插件控件与配置列表。
     *
     * 官方「…」触发器收成 0 宽并设 `pointer-events:none`：它仍在文档流里、位置就是
     * 行尾，右键和「更多」按钮都用 `.click()` 点它，官方菜单照常定位。
     *
     * @returns 一段 CSS 文本（偏好无关的部分；偏好相关的显隐由组件渲染时决定）。
     */
    function buildCss() {
      return [
        /* ── 官方触发器与官方条目：隐藏但保留（触发器要当菜单锚点） ── */
        `${STRIP_SELECTOR}:has(> ${SLOT_SELECTOR}) > span{width:0;overflow:hidden}`,
        `${STRIP_SELECTOR}:has(> ${SLOT_SELECTOR}) > span > button{width:0;min-width:0;padding:0;margin:0;border:0;opacity:0;overflow:hidden;pointer-events:none}`,
        `${SLOT_SELECTOR} > button:not([data-sra]){display:none}`,
        /* ── 本插件的一排按钮 ── */
        `.sra-group{display:inline-flex;align-items:center;gap:4px}`,
        `.sra-icon-button{box-sizing:border-box;width:16px;height:16px;flex:none;display:inline-flex;align-items:center;justify-content:center;padding:0;margin:0;border:none;background:transparent;border-radius:var(--dsw-radius-xs);color:var(--dsw-alias-label-tertiary);cursor:pointer}`,
        `.sra-icon-button:hover:not(:disabled){color:var(--dsw-alias-label-primary)}`,
        `.sra-icon-button:disabled{opacity:.5;cursor:default}`,
        /* ── 点官方菜单项时的透明化，避免菜单闪一下 ── */
        `body[data-sra-busy="1"] [role="menu"]{opacity:0!important;pointer-events:none!important}`,
        /* ── 配置区块：两个列表 ── */
        `.sra-config{display:flex;flex-direction:column;gap:20px;padding:4px 0 8px}`,
        `.sra-config-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px;margin:0}`,
        `.sra-section{display:flex;flex-direction:column;gap:8px}`,
        `.sra-section-head{display:flex;flex-direction:column;gap:2px}`,
        `.sra-section-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;line-height:22px}`,
        `.sra-section-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}`,
        `.sra-list{display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);overflow:hidden;background:var(--dsw-alias-bg-layer-1)}`,
        `.sra-item{display:flex;align-items:center;gap:10px;min-height:44px;padding:0 12px;border-bottom:.5px solid var(--dsw-alias-border-l2);transition:background .12s ease,box-shadow .12s ease}`,
        `.sra-item:last-child{border-bottom:none}`,
        `.sra-item:hover{background:var(--dsw-alias-interactive-bg-hover)}`,
        `.sra-item[data-dragging="true"]{opacity:.45}`,
        `.sra-item[data-over="true"]{box-shadow:inset 0 2px 0 var(--dsw-alias-brand-primary)}`,
        `.sra-grip{display:inline-flex;align-items:center;color:var(--dsw-alias-label-tertiary);cursor:grab}`,
        `.sra-grip:active{cursor:grabbing}`,
        `.sra-item[data-fixed="true"] .sra-grip{cursor:default;opacity:.7}`,
        `.sra-item[data-fixed="true"]{background:var(--dsw-alias-bg-layer-2)}`,
        `.sra-item-icon{display:inline-flex;align-items:center;color:var(--dsw-alias-label-secondary)}`,
        `.sra-item-label{flex:1;min-width:0;color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`,
        `.sra-item-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`,
        `.sra-check{flex:none;width:16px;height:16px;margin:0;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}`,
        `.sra-empty{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px;padding:14px 12px;background:var(--dsw-alias-bg-layer-1);border:1px dashed var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md)}`,
      ].join('\n')
    }

    /* ────────────────────────────── 图标 ────────────────────────────── */

    /**
     * 统一的外框：16×16、`currentColor` 描边。
     *
     * @param props - `size` 与子节点。
     * @returns SVG 元素。
     */
    function Glyph({ size = 14, children }) {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: 'false',
          style: { display: 'block' },
        },
        children,
      )
    }

    /** 「更多」：三个点。 */
    function EllipsisIcon(props) {
      return h(
        Glyph,
        props,
        h('circle', { cx: 3.5, cy: 8, r: 1.15, fill: 'currentColor', stroke: 'none' }),
        h('circle', { cx: 8, cy: 8, r: 1.15, fill: 'currentColor', stroke: 'none' }),
        h('circle', { cx: 12.5, cy: 8, r: 1.15, fill: 'currentColor', stroke: 'none' }),
      )
    }

    /** 置顶：图钉。 */
    function PinIcon(props) {
      return h(
        Glyph,
        props,
        h('path', { d: 'M9.5 2.5 13.5 6.5' }),
        h('path', { d: 'M10.2 3.2 6.6 6.8 3.2 7.6 8.4 12.8 9.2 9.4 12.8 5.8' }),
        h('path', { d: 'M6.4 9.6 3.2 12.8' }),
      )
    }

    /** 重命名：铅笔。 */
    function PencilIcon(props) {
      return h(
        Glyph,
        props,
        h('path', { d: 'M11.1 2.6a1.6 1.6 0 0 1 2.3 2.3l-7.4 7.4-3.3.9.9-3.3z' }),
        h('path', { d: 'M10.2 3.5 12.5 5.8' }),
      )
    }

    /** 分叉：两个提交点 + 一条分叉线。 */
    function BranchIcon(props) {
      return h(
        Glyph,
        props,
        h('circle', { cx: 4.25, cy: 3.25, r: 1.5 }),
        h('circle', { cx: 4.25, cy: 12.75, r: 1.5 }),
        h('circle', { cx: 11.75, cy: 5.25, r: 1.5 }),
        h('path', { d: 'M4.25 4.75v6.5' }),
        h('path', { d: 'M11.75 6.75v.4a2.9 2.9 0 0 1-2.9 2.9H6.3' }),
      )
    }

    /** 归档：带盖的盒子。 */
    function ArchiveIcon(props) {
      return h(
        Glyph,
        props,
        h('rect', { x: 2, y: 3, width: 12, height: 2.6, rx: 0.8 }),
        h('path', { d: 'M3 5.6v7.1c0 .5.4.9.9.9h8.2c.5 0 .9-.4.9-.9V5.6' }),
        h('path', { d: 'M6.4 9h3.2' }),
      )
    }

    /** 复制：两张叠在一起的纸。 */
    function CopyIcon(props) {
      return h(
        Glyph,
        props,
        h('rect', { x: 2.5, y: 2.5, width: 7.5, height: 7.5, rx: 1.2 }),
        h('path', { d: 'M6 11.4v1.1c0 .6.5 1 1 1h5.5c.6 0 1-.5 1-1V6c0-.6-.5-1-1-1h-1.1' }),
      )
    }

    /** 拖拽手柄：两列三点。 */
    function GripIcon(props) {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: props.size ?? 14,
          height: props.size ?? 14,
          fill: 'currentColor',
          'aria-hidden': true,
          focusable: 'false',
          style: { display: 'block' },
        },
        [5.5, 8, 10.5].map((y) => [h('circle', { key: `l${y}`, cx: 6, cy: y, r: 0.95 }), h('circle', { key: `r${y}`, cx: 10, cy: y, r: 0.95 })]),
      )
    }

    /** 固定标记：一把小锁，表示这一行位置固定、不可拖动。 */
    function FixedIcon(props) {
      return h(
        Glyph,
        props,
        h('rect', { x: 3.5, y: 7, width: 9, height: 6.5, rx: 1.4 }),
        h('path', { d: 'M5.6 7V5.4a2.4 2.4 0 0 1 4.8 0V7' }),
      )
    }

    /** 动作 → 图标组件。 */
    const ACTION_ICON = {
      more: EllipsisIcon,
      pin: PinIcon,
      rename: PencilIcon,
      fork: BranchIcon,
      archive: ArchiveIcon,
      copyId: CopyIcon,
    }

    /* ─────────────────────── 与官方菜单/DOM 的桥 ─────────────────────── */

    /**
     * 取会话行里官方「…」触发器。
     *
     * 行内结构：`div.sessionRow > span.rowActions > [span(Menu anchor) > button, div[data-slot]]`。
     *
     * @param row - 会话行元素（可为 null）。
     * @returns 触发器按钮；找不到时返回 null。
     */
    function officialTriggerOf(row) {
      if (row === null) return null
      const strip = row.querySelector(STRIP_SELECTOR)
      if (strip === null) return null
      const trigger = strip.querySelector(':scope > span > button')
      return trigger instanceof HTMLButtonElement ? trigger : null
    }

    /**
     * 取该行里官方插槽渲染的按钮（归档、置顶），用于读文案判断当前是「归档」还是「取消归档」。
     *
     * @param row - 会话行元素。
     * @returns 官方按钮数组（不含本插件渲染的 `data-sra` 按钮）。
     */
    function officialButtonsOf(row) {
      if (row === null) return []
      const box = row.querySelector(SLOT_SELECTOR)
      if (box === null) return []
      return Array.from(box.querySelectorAll(':scope > button:not([data-sra])'))
    }

    /**
     * 当前打开的官方菜单里的条目（取最后一个菜单，忽略子菜单残留）。
     *
     * @returns 菜单项按钮数组。
     */
    function officialMenuItems() {
      const menus = Array.from(document.querySelectorAll('[role="menu"]'))
      const menu = menus[menus.length - 1]
      if (menu === undefined) return []
      return Array.from(menu.querySelectorAll('[role="menuitem"]'))
    }

    /**
     * 打开官方菜单并点它的第 `index` 项，复用官方行为（确认弹窗 / 行内重命名输入框）。
     *
     * 打开的那一帧给 `body` 打 `data-sra-busy`，配合样式把菜单设为透明，
     * 用户看不到菜单闪一下；操作结束后再摘掉标记。
     *
     * @param row - 会话行元素。
     * @param index - 菜单项下标（0 置顶 / 1 重命名 / 2 分叉 / 3 归档 / 4 复制 ID）。
     * @returns 是否点到了目标条目。
     */
    async function clickOfficialMenuItem(row, index) {
      const trigger = officialTriggerOf(row)
      if (trigger === null) return false
      document.body.setAttribute('data-sra-busy', '1')
      try {
        trigger.click()
        let item = null
        for (let attempt = 0; attempt < 14 && item === null; attempt += 1) {
          await new Promise((resolve) => requestAnimationFrame(() => resolve()))
          item = officialMenuItems()[index] ?? null
        }
        if (item === null) return false
        item.click()
        return true
      } finally {
        window.setTimeout(() => document.body.removeAttribute('data-sra-busy'), 40)
      }
    }

    /* ───────────────────────── 会话行上的按钮 ───────────────────────── */

    /**
     * 造出「会话行悬浮按钮」组件：按配置渲染一排按钮。
     *
     * 组件放在 apply 内部工厂里，是为了闭包拿到插件 ctx 与偏好存储；服务在点击时
     * 才去取，避免把 `sessions` / `uiWorkspace` 写成硬依赖。
     *
     * @param ctx - 插件上下文（受限 Cordis Context）。
     * @param prefs - 偏好存储。
     * @returns 可直接注册到插槽的 React 组件。
     */
    function createRowActions(ctx, prefs) {
      return function SessionRowActions(props) {
        const { sessionId, useSessionAccess, t } = props
        const translate = typeof t === 'function' ? t : (key) => (zh[key] ?? key)
        const snapshot = usePrefs(prefs)
        const [busy, setBusy] = react.useState(null)
        const allowed =
          typeof useSessionAccess === 'function'
            ? useSessionAccess(sessionId, FORK_ACTION) !== false
            : true
        const keys = visibleActions(snapshot).filter((key) => key !== 'fork' || allowed)
        if (keys.length === 0) return null

        /**
         * 执行一个动作。
         *
         * @param key - 动作 key。
         * @param event - 点击事件（用来定位所在行）。
         */
        const run = async (key, event) => {
          if (busy !== null) return
          setBusy(key)
          try {
            const row = event.currentTarget.closest('[class*="sessionRow"]')
            if (key === 'more') {
              officialTriggerOf(row)?.click()
              return
            }
            if (key === 'fork') {
              const uiWorkspace = ctx.get('uiWorkspace')
              const sessions = ctx.get('sessions')
              let childId
              if (uiWorkspace && typeof uiWorkspace.forkSession === 'function') {
                childId = await uiWorkspace.forkSession(sessionId)
              } else if (sessions && typeof sessions.fork === 'function') {
                childId = await sessions.fork({ sessionId, increaseTitle: true })
              } else {
                throw new Error('会话服务不可用')
              }
              if (childId && uiWorkspace && typeof uiWorkspace.openSession === 'function') {
                uiWorkspace.openSession(childId)
              }
              return
            }
            if (key === 'archive') {
              const uiWorkspace = ctx.get('uiWorkspace')
              if (!uiWorkspace) throw new Error('会话服务不可用')
              const label = officialButtonsOf(row)[0]?.getAttribute('aria-label') ?? ''
              const unarchive = /取消归档|unarchive/i.test(label)
              if (unarchive) await uiWorkspace.unarchiveSession(sessionId)
              else await uiWorkspace.archiveSession(sessionId)
              return
            }
            if (key === 'copyId') {
              await navigator.clipboard.writeText(sessionId)
              return
            }
            if (key === 'pin') {
              await clickOfficialMenuItem(row, 0)
              return
            }
            if (key === 'rename') {
              await clickOfficialMenuItem(row, 1)
            }
          } catch (error) {
            console.warn(`[${PKG}] 会话行动作执行失败：${key}`, error)
          } finally {
            setBusy(null)
          }
        }

        return h(
          'span',
          { className: 'sra-group' },
          ...keys.map((key) => {
            const Icon = ACTION_ICON[key]
            const label = translate(ACTION_META[key].title)
            return h(
              'button',
              {
                key,
                type: 'button',
                'data-sra': '',
                className: 'sra-icon-button',
                'aria-label': label,
                title: label,
                disabled: busy === key,
                onClick: (event) => run(key, event),
              },
              h(Icon, { size: 14 }),
            )
          }),
        )
      }
    }

    /* ───────────────────────── 插件页配置区块 ───────────────────────── */

    /**
     * 造出插件详情页里的配置区块：说明 + 「悬浮按钮」+「更多菜单」两个可拖拽列表。
     *
     * 两个列表**各自独立**排序：
     *   - 悬浮列表 = `hoverOrder`（顺序即悬浮条顺序，同时就是「显示哪些」的集合）；
     *   - 菜单列表 = `menuOrder`（全量动作的目录顺序，只决定这份目录自身怎么排）。
     * 拖动其中一个不会影响另一个；勾选时按 `menuOrder` 的相对位置把动作插进
     * `hoverOrder`，因此菜单列表的顺序决定了新勾选项的默认落点。
     *
     * @param prefs - 偏好存储。
     * @returns 配置区块组件（收到 `{ t }`）。
     */
    function createBundleConfigSection(prefs) {
      return function SessionRowActionsBundleConfig({ t }) {
        const translate = typeof t === 'function' ? t : (key) => (zh[key] ?? key)
        const snapshot = usePrefs(prefs)
        const [dragFrom, setDragFrom] = react.useState(null)
        const [dragOver, setDragOver] = react.useState(null)
        // 悬浮列表里「可拖动」的部分（「更多」单独固定渲染，不在这里）
        const hoverKeys = snapshot.hoverOrder

        /**
         * 重排悬浮列表（只动 `hoverOrder`）。
         *
         * @param from - 拖动项下标。
         * @param to - 落点下标。
         */
        const moveInHover = (from, to) => {
          const next = hoverKeys.slice()
          const [moved] = next.splice(from, 1)
          next.splice(to, 0, moved)
          prefs.set({ hoverOrder: next })
        }

        /**
         * 重排菜单列表（只动 `menuOrder`）。
         *
         * @param from - 拖动项下标。
         * @param to - 落点下标。
         */
        const moveInMenu = (from, to) => {
          const next = snapshot.menuOrder.slice()
          const [moved] = next.splice(from, 1)
          next.splice(to, 0, moved)
          prefs.set({ menuOrder: next })
        }

        /**
         * 勾选 / 取消勾选一个动作是否加入悬浮条。
         *
         * 「更多」位置固定、不可移除，勾选状态对应 `moreVisible`；其余动作写 `hoverOrder`，
         * 加入时按 `menuOrder` 的相对次序插入，所以菜单列表的顺序决定新项落在哪。
         *
         * @param key - 动作 key。
         * @param next - 勾选后的状态。
         */
        const toggleShown = (key, next) => {
          if (key === MORE_KEY) {
            prefs.set({ moreVisible: next === true })
            return
          }
          if (!next) {
            prefs.set({ hoverOrder: snapshot.hoverOrder.filter((item) => item !== key) })
            return
          }
          if (snapshot.hoverOrder.includes(key)) return
          const rank = snapshot.menuOrder.indexOf(key)
          const order = snapshot.hoverOrder.slice()
          let insertAt = order.length
          for (let index = 0; index < order.length; index += 1) {
            if (snapshot.menuOrder.indexOf(order[index]) > rank) {
              insertAt = index
              break
            }
          }
          order.splice(insertAt, 0, key)
          prefs.set({ hoverOrder: order })
        }

        /**
         * 造一行（拖拽手柄 + 图标 + 文案 + 勾选框）。
         *
         * @param key - 动作 key。
         * @param index - 在当前列表里的下标。
         * @param variant - `hover` 或 `menu`。
         * @param fixed - 是否「固定行」（悬浮列表里的「更多」：不可拖动、不可移除）。
         * @returns 行元素。
         */
        const renderItem = (key, index, variant, fixed = false) => {
          const Icon = ACTION_ICON[key]
          const meta = ACTION_META[key]
          const checked = key === MORE_KEY ? snapshot.moreVisible === true : snapshot.hoverOrder.includes(key)
          return h(
            'div',
            {
              key,
              className: 'sra-item',
              'data-fixed': fixed ? 'true' : 'false',
              'data-dragging': dragFrom !== null && dragFrom.variant === variant && dragFrom.index === index ? 'true' : 'false',
              'data-over': dragOver !== null && dragOver.variant === variant && dragOver.index === index ? 'true' : 'false',
              draggable: fixed ? false : true,
              onDragStart: fixed
                ? undefined
                : (event) => {
                    setDragFrom({ variant, index })
                    try {
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData('text/plain', key)
                    } catch {
                      /* 某些环境禁止写 dataTransfer，忽略即可 */
                    }
                  },
              onDragOver: fixed
                ? undefined
                : (event) => {
                    event.preventDefault()
                    try {
                      event.dataTransfer.dropEffect = 'move'
                    } catch {
                      /* 同上 */
                    }
                    setDragOver({ variant, index })
                  },
              onDragLeave: fixed
                ? undefined
                : () => {
                    setDragOver((current) =>
                      current !== null && current.variant === variant && current.index === index ? null : current,
                    )
                  },
              onDrop: fixed
                ? undefined
                : (event) => {
                    event.preventDefault()
                    if (dragFrom !== null && dragFrom.variant === variant && dragFrom.index !== index) {
                      if (variant === 'hover') moveInHover(dragFrom.index, index)
                      else moveInMenu(dragFrom.index, index)
                    }
                    setDragFrom(null)
                    setDragOver(null)
                  },
              onDragEnd: fixed
                ? undefined
                : () => {
                    setDragFrom(null)
                    setDragOver(null)
                  },
            },
            h(
              'span',
              { className: 'sra-grip', title: translate(fixed ? 'item.fixed' : 'item.drag') },
              fixed ? h(FixedIcon, { size: 16 }) : h(GripIcon, { size: 16 }),
            ),
            h('span', { className: 'sra-item-icon' }, h(Icon, { size: 16 })),
            h(
              'span',
              { className: 'sra-item-label' },
              translate(meta.title),
              h('span', { className: 'sra-item-hint' }, ` · ${translate(meta.hint)}`),
            ),
            h('input', {
              type: 'checkbox',
              className: 'sra-check',
              checked,
              'aria-label': translate(meta.title),
              onChange: (event) => toggleShown(key, event.target.checked === true),
            }),
          )
        }

        return h(
          'div',
          { className: 'sra-config' },
          h(
            'div',
            { className: 'sra-section' },
            h(
              'div',
              { className: 'sra-section-head' },
              h('span', { className: 'sra-section-title' }, translate('section.hover')),
              h('span', { className: 'sra-section-hint' }, translate('section.hover.hint')),
            ),
            h(
              'div',
              { className: 'sra-list' },
              // 「更多」固定第一行：不可拖动、不可移除，只切显隐
              renderItem(MORE_KEY, -1, 'hover', true),
              ...hoverKeys.map((key, index) => renderItem(key, index, 'hover')),
            ),
          ),
          h(
            'div',
            { className: 'sra-section' },
            h(
              'div',
              { className: 'sra-section-head' },
              h('span', { className: 'sra-section-title' }, translate('section.menu')),
              h('span', { className: 'sra-section-hint' }, translate('section.menu.hint')),
            ),
            h(
              'div',
              { className: 'sra-list' },
              // 「更多」是悬浮列表的固定行，按用户要求不在这个列表里重复出现
              ...snapshot.menuOrder
                .filter((key) => key !== MORE_KEY)
                .map((key) => renderItem(key, snapshot.menuOrder.indexOf(key), 'menu')),
            ),
          ),
        )
      }
    }

    /* ───────────────────────── 右键打开官方菜单 ───────────────────────── */

    /**
     * 从事件目标找到「该会话行的官方菜单触发器」。
     *
     * @param target - 事件目标。
     * @returns 触发器按钮；不在会话行上时返回 null。
     */
    function findRowMenuTrigger(target) {
      if (!(target instanceof Element)) return null
      const row = target.closest('[class*="sessionRow"]')
      if (row === null) return null
      if (row.querySelector(SLOT_SELECTOR) === null) return null
      return officialTriggerOf(row)
    }

    /**
     * 压掉浏览器原生右键菜单（只处理会话行）。
     *
     * @param event - contextmenu 事件。
     */
    function suppressNativeMenu(event) {
      if (findRowMenuTrigger(event.target) === null) return
      event.preventDefault()
    }

    /**
     * 右键松手时打开官方菜单。
     *
     * 时序：右键序列是 `mousedown → contextmenu → mouseup`。在 mouseup 才真正点击，
     * 菜单不会在遮罩出现后被随后的 mouseup 立刻关掉（表现为“右键没反应”）。
     *
     * @param event - mouseup 事件。
     */
    function openMenuOnRightUp(event) {
      if (event.button !== 2) return
      const trigger = findRowMenuTrigger(event.target)
      if (trigger === null) return
      event.preventDefault()
      event.stopPropagation()
      trigger.click()
    }

    /**
     * 插件入口：文案、样式、右键、行按钮、插件页配置区块。
     *
     * 每一项都单独 try/catch：任何一环失败只丢那一项，绝不让 apply 抛错
     * （apply 抛错 = `web boot: 1 entry did not activate` = 整个窗口起不来）。
     *
     * @param ctx - 插件上下文。
     */
    function apply(ctx) {
      try {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), `${PKG}: 文案`)
      } catch (error) {
        console.error(`[${PKG}] 文案注册失败`, error)
      }

      const prefs = createPrefs()

      try {
        ctx.effect(() => {
          const tag = document.createElement('style')
          tag.dataset.dshPlugin = PKG
          tag.textContent = buildCss()
          document.head.appendChild(tag)
          return () => tag.remove()
        }, `${PKG}: 样式`)
      } catch (error) {
        console.error(`[${PKG}] 样式注入失败`, error)
      }

      try {
        ctx.effect(() => {
          const onContextMenu = (event) => suppressNativeMenu(event)
          const onMouseUp = (event) => openMenuOnRightUp(event)
          window.addEventListener('contextmenu', onContextMenu, true)
          window.addEventListener('mouseup', onMouseUp, true)
          return () => {
            window.removeEventListener('contextmenu', onContextMenu, true)
            window.removeEventListener('mouseup', onMouseUp, true)
          }
        }, `${PKG}: 右键菜单`)
      } catch (error) {
        console.error(`[${PKG}] 右键菜单挂载失败`, error)
      }

      try {
        const SessionRowActions = createRowActions(ctx, prefs)
        ctx.slots.inject(SLOT, () => {
          try {
            return ctx.slots.register(
              { name: SLOT, id: CELL_ID, order: 100, locale: NS },
              SessionRowActions,
            )
          } catch (error) {
            console.error(`[${PKG}] 会话行按钮注册失败（已忽略，不影响启动）`, error)
            return () => {}
          }
        })
      } catch (error) {
        console.error(`[${PKG}] 会话行按钮挂载失败`, error)
      }

      try {
        const BundleConfig = createBundleConfigSection(prefs)
        ctx.slots.inject(BUNDLE_CONFIG_SLOT, () => {
          try {
            return ctx.slots.register(
              { name: BUNDLE_CONFIG_SLOT, key: PKG, locale: NS },
              BundleConfig,
            )
          } catch (error) {
            console.error(`[${PKG}] 插件页配置区块注册失败（已忽略）`, error)
            return () => {}
          }
        })
      } catch (error) {
        console.error(`[${PKG}] 插件页配置区块挂载失败`, error)
      }
    }

    exports.inject = ['slots', 'locale']
    exports.apply = apply
    return module.exports
  },
})
