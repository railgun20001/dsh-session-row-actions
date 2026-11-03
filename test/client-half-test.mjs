// 自检：用桩跑通 client.js 的工厂、插槽注册、配置区块（两个可拖拽列表）与按钮渲染。
// 运行：node test/client-half-test.mjs（或 npm test）
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.join(here, '..', 'client.js'), 'utf8')

const SLOT = 'sidebar.workspaces.session.row.action'
const CONFIG_SLOT = 'plugins.bundle.config'
const PREFS_KEY = 'dsh-session-row-actions/prefs-v4'
const LEGACY_V3_KEY = 'dsh-session-row-actions/prefs-v3'
const LEGACY_V2_KEY = 'dsh-session-row-actions/prefs-v2'
const LEGACY_KEY = 'dsh-session-row-actions/prefs-v1'
/** 与 client.js 的 DEFAULT_ORDER 保持一致（用于断言 menuOrder 未被勾选动作改动）。 */
const DEFAULT_MENU_ORDER = ['more', 'archive', 'fork', 'pin', 'rename', 'copyId']

/** 极简 React 桩：createElement / useState / useEffect。 */
function createReact() {
  return {
    createElement(type, props, ...children) {
      return { type, props: { ...props, children } }
    },
    useState(initial) {
      return [typeof initial === 'function' ? initial() : initial, () => {}]
    },
    useEffect(effect) {
      const dispose = effect()
      return typeof dispose === 'function' ? dispose : () => {}
    },
  }
}

/**
 * 跑一遍 client.js。
 *
 * @param stored - 预置到 localStorage 的偏好（v2 或 v1）。
 * @returns 采集到的调用、注册项与样式文本。
 */
function run(stored) {
  const calls = []
  const styleTags = []
  const storage = new Map()
  if (stored !== undefined) {
    if (stored.legacy) storage.set(LEGACY_KEY, JSON.stringify(stored.legacy))
    else if (stored.legacyV2) storage.set(LEGACY_V2_KEY, JSON.stringify(stored.legacyV2))
    else if (stored.legacyV3) storage.set(LEGACY_V3_KEY, JSON.stringify(stored.legacyV3))
    else storage.set(PREFS_KEY, JSON.stringify(stored))
  }

  const fakeCtx = {
    effect(callback, label) {
      calls.push(['effect', label])
      const dispose = callback()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    locale: {
      register(ns, dicts) {
        calls.push(['locale.register', ns, Object.keys(dicts)])
        return () => {}
      },
    },
    slots: {
      inject(slot, callback) {
        calls.push(['slots.inject', slot])
        return callback()
      },
      register(options, Component) {
        calls.push(['slots.register', options, Component])
        return () => {}
      },
    },
    get: () => undefined,
  }

  globalThis.window = {
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, value),
    },
    addEventListener: (type) => calls.push(['window.addEventListener', type]),
    removeEventListener: () => {},
    innerWidth: 1500,
    innerHeight: 900,
    __ModuleLoader__: {
      load({ id, factory }) {
        const mod = factory((request) => {
          if (request === 'react') return createReact()
          throw new Error(`unexpected require: ${request}`)
        })
        if (!Array.isArray(mod.inject) || !mod.inject.includes('slots')) throw new Error('inject 缺失 slots')
        if (typeof mod.apply !== 'function') throw new Error('apply 缺失')
        calls.push(['factory', id])
        mod.apply(fakeCtx)
      },
    },
  }
  globalThis.document = {
    head: { appendChild: (tag) => styleTags.push(tag) },
    createElement: (tag) => ({ tag, dataset: {}, textContent: '', remove() {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelectorAll: () => [],
    querySelector: () => null,
    body: { setAttribute: () => {}, removeAttribute: () => {} },
  }

  new Function(source)()

  const registered = calls
    .filter(([kind]) => kind === 'slots.register')
    .map(([, options, Component]) => ({ options, Component }))
  return { calls, registered, styleText: styleTags.map((tag) => tag.textContent).join('\n') }
}

/**
 * 把组件树展开成「真实渲染过的」元素（桩不会自动执行子组件）。
 *
 * @param node - React 元素或数组。
 * @returns 展开后的元素数组。
 */
function flatten(node) {
  if (node === null || node === undefined) return []
  if (Array.isArray(node)) return node.flatMap(flatten)
  if (typeof node.type === 'function') return flatten(node.type(node.props))
  return [node]
}

/** 取元素上的文本内容。 */
function textOf(node) {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(textOf).join('')
  return textOf(node.props?.children)
}

// ── 场景 1：默认偏好 ──────────────────────────────────────────────────────────
const base = run()
if (base.calls[0][1] !== 'dsh-session-row-actions') throw new Error(`工厂 id 不对: ${String(base.calls[0][1])}`)

const rowAction = base.registered.find((entry) => entry.options.name === SLOT)
if (!rowAction) throw new Error('没有注册到会话行插槽')
if (rowAction.options.id !== 'sra-actions') throw new Error('行按钮单元格 id 不对')
if (rowAction.options.locale !== 'session-row-actions') throw new Error('locale 绑定不对')
if (base.registered.some((entry) => entry.options.name === 'settings.general.item')) {
  throw new Error('不应再占用 设置 → 通用')
}

const bundleConfig = base.registered.find((entry) => entry.options.name === CONFIG_SLOT)
if (!bundleConfig) throw new Error('没有注册到插件页配置插槽')
if (bundleConfig.options.key !== 'dsh-session-row-actions') throw new Error('配置区块 key 应为本包名')
if (bundleConfig.options.locale !== 'session-row-actions') throw new Error('配置区块没绑定 locale')

// 官方触发器/官方条目必须被隐藏（改成自己渲染之后依赖这两条规则）
if (!base.styleText.includes('> span > button{width:0')) throw new Error('没有隐藏官方「更多」触发器')
if (!base.styleText.includes('> button:not([data-sra]){display:none}')) throw new Error('没有隐藏官方插槽按钮')

// 右键：contextmenu 压原生菜单 + mouseup 才点开
for (const type of ['contextmenu', 'mouseup']) {
  if (!base.calls.some(([kind, value]) => kind === 'window.addEventListener' && value === type)) {
    throw new Error(`没有挂载 window ${type} 监听`)
  }
}

// ── 行按钮：默认只渲染「归档」「分叉」，顺序与默认 order 一致 ────────────────
const RowActions = rowAction.Component
const strip = flatten(RowActions({ sessionId: 's1', displayTitle: 't', useSessionAccess: () => true, t: (key) => key }))
const stripButtons = strip[0].props.children.filter((child) => child && child.type === 'button')
if (stripButtons.length !== 2) throw new Error(`默认应渲染 2 个悬浮按钮，实际 ${stripButtons.length}`)
if (stripButtons[0].props['aria-label'] !== 'action.archive') throw new Error('默认第一个应为「归档」')
if (stripButtons[1].props['aria-label'] !== 'action.fork') throw new Error('默认第二个应为「分叉」')
if (stripButtons[0].props['data-sra'] !== '') throw new Error('按钮缺少 data-sra 标记')

// 无分叉权限时只剩「归档」
const denied = flatten(RowActions({ sessionId: 's1', displayTitle: 't', useSessionAccess: () => false, t: (key) => key }))
const deniedButtons = denied[0].props.children.filter((child) => child && child.type === 'button')
if (deniedButtons.length !== 1 || deniedButtons[0].props['aria-label'] !== 'action.archive') {
  throw new Error('无权限时应只剩「归档」')
}

// ── 配置区块：两个列表 + 勾选框 ──────────────────────────────────────────────
const configTree = flatten(bundleConfig.Component({ t: (key) => key }))[0]
if (configTree.props.className !== 'sra-config') throw new Error('配置区块缺少样式类')
const sections = configTree.props.children.filter((child) => child && child.props?.className === 'sra-section')
if (sections.length !== 2) throw new Error(`应有 2 个列表分区，实际 ${sections.length}`)

/** 取某个分区里的行元素。 */
const itemsOf = (section) => {
  const list = flatten(section.props.children).find((child) => child.props?.className === 'sra-list')
  if (!list) return []
  return list.props.children.filter((child) => child && child.props?.className === 'sra-item')
}
const hoverItems = itemsOf(sections[0])
const menuItems = itemsOf(sections[1])
// 悬浮列表：第一行永远是固定的「更多」，后面是已勾选的动作
if (hoverItems.length !== 3) throw new Error(`悬浮列表默认应有 3 行（更多+归档+分叉），实际 ${hoverItems.length}`)
// 「更多」只属于悬浮列表，不再出现在「更多菜单」列表里
if (menuItems.length !== 5) throw new Error(`更多菜单列表应有 5 项（不含「更多」），实际 ${menuItems.length}`)
if (menuItems.some((item) => textOf(item).includes('action.more'))) {
  throw new Error('「更多菜单」列表里不应出现「更多」')
}
if (!textOf(hoverItems[0]).includes('action.more')) throw new Error('悬浮列表第一行应为固定的「更多」')
if (!textOf(hoverItems[1]).includes('action.archive')) throw new Error('悬浮列表第二行应为「归档」')
if (!textOf(menuItems[1]).includes('action.fork')) throw new Error('菜单列表第 2 项应为「分叉」')

// 「更多」那行固定：不可拖动；其余行可拖动；每行都有勾选框
if (hoverItems[0].props.draggable !== false) throw new Error('「更多」行不应可拖动')
if (hoverItems[0].props['data-fixed'] !== 'true') throw new Error('「更多」行缺少固定标记')
if (hoverItems.slice(1).some((item) => item.props.draggable !== true)) throw new Error('悬浮列表其余行应可拖动')
for (const item of [...hoverItems, ...menuItems]) {
  const checkbox = item.props.children.find((child) => child && child.type === 'input')
  if (!checkbox || checkbox.props.type !== 'checkbox') throw new Error('行缺少勾选框')
}
// 默认勾选状态：归档/分叉勾上，「更多」不显示
const checkedOf = (item) => item.props.children.find((child) => child && child.type === 'input').props.checked
if (hoverItems.slice(1).some((item) => checkedOf(item) !== true)) throw new Error('悬浮列表里的动作都应是勾选状态')
const moreRow = hoverItems[0]
if (checkedOf(moreRow) !== false) throw new Error('「更多」默认应为隐藏')

// 勾选「更多」→ 只改 moreVisible，悬浮条渲染时它仍排第一
const checkboxOf = (item) => item.props.children.find((child) => child && child.type === 'input')
checkboxOf(moreRow).props.onChange({ target: { checked: true } })
const afterCheck = JSON.parse(globalThis.window.localStorage.getItem(PREFS_KEY) ?? 'null')
if (afterCheck === null || afterCheck.moreVisible !== true) throw new Error('勾选「更多」应写入 moreVisible=true')
if (afterCheck.hoverOrder.join(',') !== 'archive,fork') {
  throw new Error(`「更多」不应进入 hoverOrder：${afterCheck?.hoverOrder?.join(',')}`)
}
if (afterCheck.menuOrder.join(',') !== DEFAULT_MENU_ORDER.join(',')) {
  throw new Error('勾选不应改动 menuOrder')
}

// 取消勾选「归档」→ 只从 hoverOrder 里移除
const baseConfig = flatten(bundleConfig.Component({ t: (key) => key }))[0]
const baseSections = baseConfig.props.children.filter((child) => child && child.props?.className === 'sra-section')
const archiveRow = itemsOf(baseSections[0]).find((item) => textOf(item).includes('action.archive'))
if (!archiveRow) throw new Error('悬浮列表里找不到「归档」行')
checkboxOf(archiveRow).props.onChange({ target: { checked: false } })
const afterUncheck = JSON.parse(globalThis.window.localStorage.getItem(PREFS_KEY) ?? 'null')
if (afterUncheck === null || afterUncheck.hoverOrder.join(',') !== 'fork') {
  throw new Error(`取消勾选「归档」后 hoverOrder 不对：${afterUncheck?.hoverOrder?.join(',')}`)
}

// ── 场景 2：两个列表顺序互不影响 ──────────────────────────────────────────
// 菜单列表顺序与悬浮条顺序故意不一致：悬浮条只认 hoverOrder
const custom = run({
  menuOrder: ['more', 'copyId', 'rename', 'pin', 'fork', 'archive'],
  hoverOrder: ['copyId', 'archive', 'pin', 'rename', 'fork'],
  moreVisible: true,
})
const customStrip = flatten(
  custom.registered.find((entry) => entry.options.name === SLOT).Component({
    sessionId: 's1',
    displayTitle: 't',
    useSessionAccess: () => true,
    t: (key) => key,
  }),
)[0].props.children.filter((child) => child && child.type === 'button')
if (customStrip.length !== 6) throw new Error('全部勾选时应渲染 6 个按钮')
const order = customStrip.map((button) => button.props['aria-label'])
// 「更多」永远第一，其余严格按 hoverOrder
const expected = ['action.more', 'action.copyId', 'action.archive', 'action.pin', 'action.rename', 'action.fork']
if (order.join(',') !== expected.join(',')) throw new Error(`悬浮条顺序不对：${order.join(',')}`)

const customConfig = flatten(custom.registered.find((entry) => entry.options.name === CONFIG_SLOT).Component({ t: (key) => key }))[0]
const customSections = customConfig.props.children.filter((child) => child && child.props?.className === 'sra-section')
const customHoverItems = itemsOf(customSections[0])
const customMenuItems = itemsOf(customSections[1])
if (!textOf(customHoverItems[0]).includes('action.more')) throw new Error('悬浮列表第一行应固定为「更多」')
if (!textOf(customHoverItems[1]).includes('action.copyId')) throw new Error('悬浮列表第二行应为 hoverOrder 的首项')
// 菜单列表按 menuOrder 排，且不含「更多」→ 首项应是 menuOrder 里第一个非「更多」的动作
if (!textOf(customMenuItems[0]).includes('action.copyId')) throw new Error('菜单列表应按 menuOrder 排序（跳过「更多」）')
if (customMenuItems.some((item) => textOf(item).includes('action.more'))) throw new Error('菜单列表不应包含「更多」')

// ── 场景 3：v3 迁移（hoverOrder 里混着「更多」→ 抽到 moreVisible） ──────────
const migratedV3 = run({ legacyV3: { menuOrder: ['more', 'archive', 'fork', 'pin', 'rename', 'copyId'], hoverOrder: ['more', 'fork', 'archive'] } })
const v3Config = flatten(migratedV3.registered.find((entry) => entry.options.name === CONFIG_SLOT).Component({ t: (key) => key }))[0]
const v3Sections = v3Config.props.children.filter((child) => child && child.props?.className === 'sra-section')
const v3Hover = itemsOf(v3Sections[0])
if (!textOf(v3Hover[1]).includes('action.fork') || !textOf(v3Hover[2]).includes('action.archive')) {
  throw new Error('v3 迁移后悬浮列表顺序应是 fork, archive')
}
if (checkedOf(v3Hover[0]) !== true) throw new Error('v3 迁移后「更多」应是显示状态')

// ── 场景 4：v2 偏好迁移（{ order, shown } → menuOrder + hoverOrder + moreVisible） ──
const migratedV2 = run({ legacyV2: { order: ['more', 'copyId', 'rename', 'pin', 'fork', 'archive'], shown: { more: true, pin: true, fork: true, archive: true, rename: false, copyId: false } } })
const v2Strip = flatten(
  migratedV2.registered.find((entry) => entry.options.name === SLOT).Component({
    sessionId: 's1',
    displayTitle: 't',
    useSessionAccess: () => true,
    t: (key) => key,
  }),
)[0].props.children.filter((child) => child && child.type === 'button')
const v2Labels = v2Strip.map((button) => button.props['aria-label'])
if (v2Labels.join(',') !== ['action.more', 'action.pin', 'action.fork', 'action.archive'].join(',')) {
  throw new Error(`v2 迁移后的悬浮条顺序不对：${v2Labels.join(',')}`)
}

// ── 场景 5：v1 偏好迁移 ────────────────────────────────────────────────────
const migrated = run({ legacy: { hideMore: false, showArchive: false, showFork: true } })
const migratedStrip = flatten(
  migrated.registered.find((entry) => entry.options.name === SLOT).Component({
    sessionId: 's1',
    displayTitle: 't',
    useSessionAccess: () => true,
    t: (key) => key,
  }),
)[0].props.children.filter((child) => child && child.type === 'button')
const migratedLabels = migratedStrip.map((button) => button.props['aria-label'])
if (!migratedLabels.includes('action.more')) throw new Error('v1 的 hideMore=false 应迁移为显示「更多」')
if (migratedLabels.includes('action.archive')) throw new Error('v1 的 showArchive=false 应迁移为不显示「归档」')

console.log('OK: 工厂 / 行插槽 / 固定「更多」/ 两个列表独立排序 / 勾选 / 权限 / v3、v2、v1 迁移 全部通过')
