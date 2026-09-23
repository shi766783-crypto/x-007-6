import { defineStore } from 'pinia'
import { read, write } from '@/utils/storage'
import { uid } from '@/utils/id'
import { useInventoryStore } from './inventory'
import { useMealPlanStore } from './mealPlan'

const LIST_KEY = 'shopping-list'
const HISTORY_KEY = 'shopping-history'
const BUDGET_KEY = 'shopping-monthly-budget'

// 预算预警阈值：已花达到预算的 80% 视为接近上限
const BUDGET_WARN_RATIO = 0.8

export const useShoppingListStore = defineStore('shoppingList', {
  state: () => ({
    items: read(LIST_KEY, []),
    history: read(HISTORY_KEY, []), // 采购记录 [{ id, date, items, total }]
    monthlyBudget: read(BUDGET_KEY, 0), // 每月买菜预算（元），0 表示未设置
  }),

  getters: {
    activeItems: (state) => state.items.filter((i) => !i.purchased),
    purchasedItems: (state) => state.items.filter((i) => i.purchased),
    // 本轮采购轮次（完成次数）
    purchaseRounds: (state) => state.history.length,
    // 总花费
    totalSpend: (state) => state.history.reduce((s, h) => s + Number(h.total || 0), 0),
    weeklySpend() {
      const now = new Date()
      const start = new Date(now)
      const day = now.getDay()
      start.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
      start.setHours(0, 0, 0, 0)
      return this.history
        .filter((h) => new Date(h.date) >= start)
        .reduce((s, h) => s + Number(h.total || 0), 0)
    },
    // 本月已花：按采购完成日期归属自然月自动累加
    monthlySpend(state) {
      const now = new Date()
      return state.history
        .filter((h) => {
          const d = new Date(h.date)
          return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
        })
        .reduce((s, h) => s + Number(h.total || 0), 0)
    },
    // 本月剩余可花金额（超支时为负数）
    monthlyRemaining() {
      return Number(this.monthlyBudget || 0) - this.monthlySpend
    },
    // 预算使用比例
    budgetUsedRatio() {
      const budget = Number(this.monthlyBudget || 0)
      return budget > 0 ? this.monthlySpend / budget : 0
    },
    // 预算状态：unset 未设置 | ok 正常 | near 接近上限 | over 已超支
    budgetStatus() {
      if (!(Number(this.monthlyBudget) > 0)) return 'unset'
      if (this.monthlySpend > this.monthlyBudget) return 'over'
      if (this.budgetUsedRatio >= BUDGET_WARN_RATIO) return 'near'
      return 'ok'
    },
    // 缺口总额（未采购项）
    totalGap: (state) =>
      state.items.filter((i) => !i.purchased).reduce((s, i) => s + Number(i.gap || 0), 0),
  },

  actions: {
    persist() {
      write(LIST_KEY, this.items)
      write(HISTORY_KEY, this.history)
    },

    // 设置/调整每月买菜预算（随时可调，传 0 可清除）
    setBudget(amount) {
      const value = Number(amount)
      this.monthlyBudget = Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : 0
      write(BUDGET_KEY, this.monthlyBudget)
    },

    // 记录单个食材的报价，并即时持久化，避免刷新后丢失
    updatePrice(id, price) {
      const item = this.items.find((i) => i.id === id)
      if (!item) return
      const value = Number(price)
      item.price = Number.isFinite(value) && value > 0 ? value : 0
      write(LIST_KEY, this.items)
    },

    // 根据本周食谱计划与库存生成采购清单
    generate() {
      const mealPlan = useMealPlanStore()
      const inventory = useInventoryStore()
      const requirements = mealPlan.weeklyRequirements

      this.items = requirements
        .map((req) => {
          const inStock = inventory.findByRef(req)
          const available = inStock ? Number(inStock.quantity || 0) : 0
          const gap = Math.max(0, req.required - available)
          return {
            id: uid('shop'),
            name: req.name,
            unit: req.unit,
            ingredientId: req.ingredientId,
            required: req.required,
            inStock: available,
            gap,
            price: 0,
            purchased: false,
            createdAt: new Date().toISOString(),
          }
        })
        .filter((i) => i.gap > 0)

      this.persist()
      return this.items
    },

    // 标记已采购并自动入库
    markPurchased(ids) {
      const inventory = useInventoryStore()
      const targets = this.items.filter((i) => ids.includes(i.id) && !i.purchased)

      targets.forEach((i) => {
        inventory.restock({
          name: i.name,
          unit: i.unit,
          quantity: i.gap,
          category: i.category || '其他',
        })
        i.purchased = true
      })

      const total = targets.reduce((s, i) => s + Number(i.price || 0), 0)
      if (targets.length) {
        this.history.unshift({
          id: uid('purchase'),
          date: new Date().toISOString(),
          items: targets.map((t) => ({ name: t.name, unit: t.unit, quantity: t.gap, price: t.price })),
          total,
        })
      }
      this.persist()
      return targets.length
    },

    // 全部标记已采购
    markAllPurchased() {
      const ids = this.activeItems.map((i) => i.id)
      return this.markPurchased(ids)
    },

    clearCompleted() {
      this.items = this.items.filter((i) => !i.purchased)
      this.persist()
    },

    resetList() {
      this.items = []
      this.persist()
    },
  },
})
