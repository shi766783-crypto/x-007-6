import { defineStore } from 'pinia'
import { read, write } from '@/utils/storage'
import { uid } from '@/utils/id'
import { useInventoryStore } from './inventory'
import { useMealPlanStore } from './mealPlan'

const LIST_KEY = 'shopping-list'
const HISTORY_KEY = 'shopping-history'
const BUDGET_KEY = 'shopping-monthly-budget'

// 接近预算预警阈值（使用率达到 80%）
const BUDGET_WARN_RATIO = 0.8

export const useShoppingListStore = defineStore('shoppingList', {
  state: () => ({
    items: read(LIST_KEY, []),
    history: read(HISTORY_KEY, []), // 采购记录 [{ id, date, items, total }]
    monthlyBudget: Number(read(BUDGET_KEY, 0)) || 0, // 每月买菜预算（元），0 表示未设置
  }),

  getters: {
    activeItems: (state) => state.items.filter((i) => !i.purchased),
    purchasedItems: (state) => state.items.filter((i) => i.purchased),
    // 本轮采购轮次（完成次数）
    purchaseRounds: (state) => state.history.length,
    // 总花费
    totalSpend: (state) => state.history.reduce((s, h) => s + Number(h.total || 0), 0),

    // 当前月份标签，如 “9月”
    currentMonthLabel() {
      return `${new Date().getMonth() + 1}月`
    },
    // 当月已支出（采购完成入库时自动累加）
    monthlySpend(state) {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      return state.history
        .filter((h) => new Date(h.date) >= start)
        .reduce((s, h) => s + Number(h.total || 0), 0)
    },
    hasBudget: (state) => Number(state.monthlyBudget) > 0,
    // 本月剩余可花金额（负数表示已超支）
    monthlyRemaining() {
      return Number(this.monthlyBudget) - this.monthlySpend
    },
    // 预算使用率
    budgetUsageRatio() {
      if (!this.hasBudget) return 0
      return this.monthlySpend / this.monthlyBudget
    },
    // 预算状态：unset 未设置 | ok 正常 | near 接近预算 | over 已超支
    budgetStatus() {
      if (!this.hasBudget) return 'unset'
      if (this.monthlySpend > this.monthlyBudget) return 'over'
      if (this.budgetUsageRatio >= BUDGET_WARN_RATIO) return 'near'
      return 'ok'
    },
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
    // 缺口总额（未采购项）
    totalGap: (state) =>
      state.items.filter((i) => !i.purchased).reduce((s, i) => s + Number(i.gap || 0), 0),
  },

  actions: {
    persist() {
      write(LIST_KEY, this.items)
      write(HISTORY_KEY, this.history)
    },

    // 设置/调整每月预算（预算随时可调，0 表示清除预算）
    setBudget(amount) {
      const value = Math.max(0, Number(amount) || 0)
      this.monthlyBudget = value
      write(BUDGET_KEY, value)
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
