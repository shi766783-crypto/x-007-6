<script setup>
import { ref, computed } from 'vue'
import { useShoppingListStore } from '@/stores/shoppingList'
import { useMealPlanStore } from '@/stores/mealPlan'
import BaseButton from '@/components/common/BaseButton.vue'
import BaseEmpty from '@/components/common/BaseEmpty.vue'

const shopping = useShoppingListStore()
const mealPlan = useMealPlanStore()

const selected = ref(new Set())

const active = computed(() => shopping.activeItems)
const purchased = computed(() => shopping.purchasedItems)

// 预算编辑
const editingBudget = ref(false)
const budgetInput = ref('')

const budgetPercent = computed(() =>
  Math.min(100, Math.round(shopping.budgetUsageRatio * 100)),
)
const budgetBarColor = computed(() => {
  if (shopping.budgetStatus === 'over') return 'var(--danger)'
  if (shopping.budgetStatus === 'near') return 'var(--warn)'
  return 'var(--primary)'
})
const budgetCardClass = computed(() => `budget-card ${shopping.budgetStatus}`)

function startEditBudget() {
  budgetInput.value = shopping.hasBudget ? String(shopping.monthlyBudget) : ''
  editingBudget.value = true
}

function saveBudget() {
  const value = Number(budgetInput.value)
  if (!Number.isFinite(value) || value < 0) {
    alert('请输入有效的预算金额')
    return
  }
  shopping.setBudget(value)
  editingBudget.value = false
}

function cancelEditBudget() {
  editingBudget.value = false
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
    alert(`已入库 ${n} 种食材 ✅`)
  }
}

function markAll() {
  const n = shopping.markAllPurchased()
  selected.value = new Set()
  if (n) alert(`已采购并入库全部 ${n} 种食材 ✅`)
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

    <!-- 月度采购预算 -->
    <div :class="budgetCardClass">
      <div class="budget-head">
        <div class="budget-title">💰 {{ shopping.currentMonthLabel }}买菜预算</div>
        <BaseButton v-if="!editingBudget" size="sm" variant="ghost" @click="startEditBudget">
          {{ shopping.hasBudget ? '调整预算' : '设置预算' }}
        </BaseButton>
      </div>

      <!-- 设置/编辑预算 -->
      <div v-if="editingBudget" class="budget-edit">
        <span class="unit">¥</span>
        <input
          v-model="budgetInput"
          type="number"
          min="0"
          step="10"
          placeholder="请输入本月买菜额度"
          @keyup.enter="saveBudget"
        />
        <BaseButton size="sm" @click="saveBudget">保存</BaseButton>
        <BaseButton size="sm" variant="ghost" @click="cancelEditBudget">取消</BaseButton>
      </div>

      <template v-else-if="shopping.hasBudget">
        <div class="budget-nums">
          <span class="spent">¥{{ shopping.monthlySpend.toFixed(1) }}</span>
          <span class="muted small">/ ¥{{ shopping.monthlyBudget.toFixed(1) }}</span>
          <span class="remaining" :class="shopping.budgetStatus">
            {{
              shopping.monthlyRemaining >= 0
                ? `剩余可花 ¥${shopping.monthlyRemaining.toFixed(1)}`
                : `已超支 ¥${Math.abs(shopping.monthlyRemaining).toFixed(1)}`
            }}
          </span>
        </div>
        <div class="budget-bar">
          <div
            class="budget-bar-fill"
            :style="{ width: budgetPercent + '%', background: budgetBarColor }"
          ></div>
        </div>
        <div v-if="shopping.budgetStatus === 'near'" class="budget-tip warn">
          ⚠️ 本月预算已使用 {{ budgetPercent }}%，接近上限，注意控制采购！
        </div>
        <div v-else-if="shopping.budgetStatus === 'over'" class="budget-tip danger">
          🛑 本月买菜已超支 {{ Math.abs(shopping.monthlyRemaining).toFixed(1) }} 元，请削减非必要采购！
        </div>
      </template>

      <div v-else class="muted small budget-empty">
        尚未设置每月买菜预算，设置后可实时查看剩余可花金额，避免月底超支。
      </div>
    </div>

    <div v-if="active.length" class="toolbar card">
      <BaseButton size="sm" @click="markSelected" :disabled="!selected.size">
        标记已采购（{{ selected.size }}）
      </BaseButton>
      <BaseButton size="sm" variant="ghost" @click="markAll">全部标记已采购并入库</BaseButton>
    </div>

    <BaseEmpty v-if="!active.length && !purchased.length" emoji="🛒" text="暂无采购清单，点击上方按钮生成" />

    <div v-if="active.length" class="card">
      <div class="section-title">待采购 <span class="muted small">缺口 {{ active.reduce((s, i) => s + i.gap, 0) }} 件</span></div>
      <div class="list">
        <div v-for="i in active" :key="i.id" class="shop-row">
          <input type="checkbox" :checked="selected.has(i.id)" @change="toggle(i.id)" />
          <div class="info">
            <div class="name">{{ i.name }}</div>
            <div class="muted small">需 {{ i.required }}{{ i.unit }} · 库存 {{ i.inStock }}{{ i.unit }} · 缺 {{ i.gap }}{{ i.unit }}</div>
          </div>
          <div class="price">
            <span class="muted small">¥</span>
            <input v-model.number="i.price" type="number" min="0" step="0.1" />
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
.budget-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 4px solid var(--primary);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 14px 16px;
  margin-bottom: 16px;
}
.budget-card.near {
  border-left-color: var(--warn);
  background: var(--warn-light);
}
.budget-card.over {
  border-left-color: var(--danger);
  background: var(--danger-light);
}
.budget-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.budget-title {
  font-weight: 600;
}
.budget-nums {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 8px;
}
.budget-nums .spent {
  font-size: 22px;
  font-weight: 700;
}
.budget-nums .remaining {
  margin-left: auto;
  font-size: 13px;
  font-weight: 600;
  color: var(--primary-dark);
}
.budget-nums .remaining.near {
  color: var(--warn);
}
.budget-nums .remaining.danger {
  color: var(--danger);
}
.budget-bar {
  height: 8px;
  border-radius: 4px;
  background: var(--surface-2);
  overflow: hidden;
}
.budget-bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}
.budget-tip {
  margin-top: 8px;
  font-size: 13px;
  font-weight: 500;
}
.budget-tip.warn {
  color: #e65100;
}
.budget-tip.danger {
  color: #c62828;
}
.budget-empty {
  margin: 0;
}
.budget-edit {
  display: flex;
  align-items: center;
  gap: 8px;
}
.budget-edit .unit {
  font-weight: 600;
  color: var(--text-2);
}
.budget-edit input {
  width: 160px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
}
.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.small {
  font-size: 12px;
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
