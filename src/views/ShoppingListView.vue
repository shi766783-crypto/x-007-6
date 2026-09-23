<script setup>
import { ref, computed } from 'vue'
import { useShoppingListStore } from '@/stores/shoppingList'
import { useMealPlanStore } from '@/stores/mealPlan'
import BaseButton from '@/components/common/BaseButton.vue'
import BaseEmpty from '@/components/common/BaseEmpty.vue'
import BudgetPanel from '@/components/shopping/BudgetPanel.vue'

const shopping = useShoppingListStore()
const mealPlan = useMealPlanStore()

const selected = ref(new Set())

const active = computed(() => shopping.activeItems)
const purchased = computed(() => shopping.purchasedItems)

// 待采购项报价合计
const activeTotal = computed(() => active.value.reduce((s, i) => s + Number(i.price || 0), 0))
// 预算试算：勾选了食材时按勾选项估算，未勾选时按全部待采购估算
const projectedSpend = computed(() => {
  const list = selected.value.size
    ? active.value.filter((i) => selected.value.has(i.id))
    : active.value
  return list.reduce((s, i) => s + Number(i.price || 0), 0)
})
const projectRemaining = computed(() => shopping.monthlyRemaining - projectedSpend.value)
const projectStatus = computed(() => {
  if (!(Number(shopping.monthlyBudget) > 0)) return 'unset'
  if (projectRemaining.value < 0) return 'over'
  if (shopping.monthlySpend + projectedSpend.value >= shopping.monthlyBudget * 0.8) return 'near'
  return 'ok'
})

// 采购完成后的预算提醒文案
function budgetAlertMsg(n) {
  const status = shopping.budgetStatus
  if (status === 'unset') return `已入库 ${n} 种食材 ✅`
  if (status === 'over')
    return `已入库 ${n} 种食材 ✅\n⚠️ 本月买菜已超支 ¥${Math.abs(shopping.monthlyRemaining).toFixed(1)}，请控制后续支出！`
  if (status === 'near')
    return `已入库 ${n} 种食材 ✅\n⚠️ 本月预算仅剩 ¥${shopping.monthlyRemaining.toFixed(1)}，注意别超支。`
  return `已入库 ${n} 种食材 ✅\n本月预算还剩 ¥${shopping.monthlyRemaining.toFixed(1)}。`
}

function toggle(id) {
  const s = new Set(selected.value)
  s.has(id) ? s.delete(id) : s.add(id)
  selected.value = s
}

function generate() {
  const count = shopping.generate()
  selected.value = new Set()
  if (!count.length) alert('本周食材库存充足，无需采购！')
}

function markSelected() {
  const n = shopping.markPurchased([...selected.value])
  if (n) {
    selected.value = new Set()
    alert(budgetAlertMsg(n))
  }
}

function markAll() {
  const n = shopping.markAllPurchased()
  selected.value = new Set()
  if (n) alert(budgetAlertMsg(n))
}

function fmtDate(iso) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
</script>

<template>
  <div>
    <div class="page-head">
      <h2>🛒 采购清单</h2>
      <BaseButton @click="generate">根据本周食谱生成清单</BaseButton>
    </div>

    <p class="muted hint">系统会对比本周食谱所需食材总量与当前库存，自动计算缺口数量。</p>

    <div class="budget-wrap">
      <BudgetPanel variant="full" />
    </div>

    <div v-if="active.length" class="toolbar card">
      <BaseButton size="sm" @click="markSelected" :disabled="!selected.size">
        标记已采购（{{ selected.size }}）
      </BaseButton>
      <BaseButton size="sm" variant="ghost" @click="markAll">全部标记已采购并入库</BaseButton>
    </div>

    <BaseEmpty v-if="!active.length && !purchased.length" emoji="🛒" text="暂无采购清单，点击上方按钮生成" />

    <div v-if="active.length" class="card">
      <div class="section-title">
        待采购 <span class="muted small">缺口 {{ active.reduce((s, i) => s + i.gap, 0) }} 件</span>
        <span class="cart-total muted small">
          本单合计 ¥{{ activeTotal.toFixed(1) }}
          <template v-if="shopping.budgetStatus !== 'unset'">
            · 采购后
            <span :class="projectStatus === 'over' ? 'txt-over' : projectStatus === 'near' ? 'txt-near' : 'txt-ok'">
              {{ projectStatus === 'over'
                ? `超支 ¥${Math.abs(projectRemaining).toFixed(1)}`
                : `剩 ¥${projectRemaining.toFixed(1)}` }}
            </span>
          </template>
        </span>
      </div>
      <div class="list">
        <div v-for="i in active" :key="i.id" class="shop-row">
          <input type="checkbox" :checked="selected.has(i.id)" @change="toggle(i.id)" />
          <div class="info">
            <div class="name">{{ i.name }}</div>
            <div class="muted small">需 {{ i.required }}{{ i.unit }} · 库存 {{ i.inStock }}{{ i.unit }} · 缺 {{ i.gap }}{{ i.unit }}</div>
          </div>
          <div class="price">
            <span class="muted small">¥</span>
            <input
              :value="i.price || ''"
              type="number"
              min="0"
              step="0.1"
              placeholder="价格"
              @input="shopping.updatePrice(i.id, $event.target.value)"
            />
          </div>
        </div>
      </div>
    </div>

    <div v-if="purchased.length" class="card">
      <div class="section-title">已采购 <BaseButton size="sm" variant="text" @click="shopping.clearCompleted">清除</BaseButton></div>
      <div class="muted small">
        {{ purchased.map((i) => `${i.name} ${i.gap}${i.unit}`).join('、') }}
      </div>
    </div>

    <div v-if="shopping.history.length" class="card">
      <div class="section-title">采购记录</div>
      <div class="history">
        <div v-for="h in shopping.history" :key="h.id" class="hist-row">
          <span class="muted">{{ fmtDate(h.date) }}</span>
          <span class="items">{{ h.items.map((i) => i.name).join('、') }}</span>
          <span class="total">¥{{ (h.total || 0).toFixed(1) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.page-head h2 {
  margin: 0;
}
.hint {
  margin-bottom: 16px;
}
.budget-wrap {
  margin-bottom: 16px;
}
.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.small {
  font-size: 12px;
}
.cart-total {
  font-weight: 400;
}
.txt-ok {
  color: var(--primary-dark);
  font-weight: 600;
}
.txt-near {
  color: #e65100;
  font-weight: 600;
}
.txt-over {
  color: var(--danger);
  font-weight: 600;
}
.list {
  display: flex;
  flex-direction: column;
}
.shop-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}
.shop-row:last-child {
  border-bottom: none;
}
.info {
  flex: 1;
}
.name {
  font-weight: 600;
}
.price {
  display: flex;
  align-items: center;
  gap: 4px;
}
.price input {
  width: 70px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  text-align: right;
}
.history {
  display: flex;
  flex-direction: column;
}
.hist-row {
  display: flex;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}
.hist-row:last-child {
  border-bottom: none;
}
.hist-row .items {
  flex: 1;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.total {
  font-weight: 600;
  color: var(--primary-dark);
}
</style>
