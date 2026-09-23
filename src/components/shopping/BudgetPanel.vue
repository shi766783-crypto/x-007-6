<script setup>
import { ref, computed, watch } from 'vue'
import { useShoppingListStore } from '@/stores/shoppingList'
import BaseButton from '@/components/common/BaseButton.vue'
import BaseModal from '@/components/common/BaseModal.vue'

const props = defineProps({
  // compact 用于首页横条提示，full 用于清单页详细卡片
  variant: { type: String, default: 'full' }, // full | compact
})

const shopping = useShoppingListStore()

const showEditor = ref(false)
const draftBudget = ref('')

const budget = computed(() => Number(shopping.monthlyBudget || 0))
const spent = computed(() => shopping.monthlySpend)
const remaining = computed(() => shopping.monthlyRemaining)
const status = computed(() => shopping.budgetStatus)
const ratio = computed(() => Math.min(1, shopping.budgetUsedRatio))
const overRatio = computed(() => Math.max(0, (spent.value - budget.value) / (budget.value || 1)))

const monthLabel = computed(() => {
  const d = new Date()
  return `${d.getFullYear()}年${d.getMonth() + 1}月`
})

const statusText = computed(() => {
  if (status.value === 'over') return `本月买菜已超支 ¥${Math.abs(remaining.value).toFixed(1)}`
  if (status.value === 'near') return `预算即将用完，仅剩 ¥${remaining.value.toFixed(1)}`
  if (status.value === 'ok') return `本月还可花 ¥${remaining.value.toFixed(1)}`
  return '尚未设置每月买菜预算'
})

watch(showEditor, (open) => {
  if (open) draftBudget.value = budget.value ? String(budget.value) : ''
})

function openEditor() {
  draftBudget.value = budget.value ? String(budget.value) : ''
  showEditor.value = true
}

function save() {
  const value = Number(draftBudget.value)
  if (draftBudget.value === '' || !Number.isFinite(value) || value < 0) {
    alert('请输入有效的预算金额')
    return
  }
  shopping.setBudget(value)
  showEditor.value = false
}

function clearBudget() {
  if (!budget.value) return
  if (confirm('确定清除每月买菜预算吗？清除后将不再进行预算提醒。')) {
    shopping.setBudget(0)
    showEditor.value = false
  }
}
</script>

<template>
  <!-- 未设置预算：仅显示一个引导入口 -->
  <div v-if="status === 'unset'" class="budget-entry" :class="`is-${props.variant}`" @click="openEditor">
    <span class="entry-icon">💰</span>
    <span class="entry-text">
      <strong>设置每月买菜预算</strong>
      <span class="muted small">设置后自动统计当月支出，超支提前提醒</span>
    </span>
    <span class="entry-arrow">→</span>
  </div>

  <!-- 已设置：预算卡片 -->
  <div v-else class="budget-card" :class="[`is-${props.variant}`, `status-${status}`]">
    <div class="budget-head">
      <div class="budget-title">
        <span class="title-icon">💰</span>
        <span>{{ monthLabel }}买菜预算</span>
      </div>
      <BaseButton size="sm" variant="text" @click.stop="openEditor">
        {{ budget ? '调整预算' : '设置预算' }}
      </BaseButton>
    </div>

    <div class="budget-body">
      <div class="amounts">
        <div class="amount-main">
          <span class="label">{{ status === 'over' ? '已超支' : '剩余可花' }}</span>
          <span class="value">¥{{ Math.abs(remaining).toFixed(1) }}</span>
        </div>
        <div class="amount-sub muted small">
          已花 ¥{{ spent.toFixed(1) }} / 预算 ¥{{ budget.toFixed(1) }}
        </div>
      </div>

      <div v-if="variant === 'full'" class="progress">
        <div class="bar">
          <div
            v-if="status !== 'over'"
            class="fill"
            :class="{ near: status === 'near' }"
            :style="{ width: `${ratio * 100}%` }"
          ></div>
          <div v-else class="fill over" :style="{ width: '100%' }"></div>
        </div>
        <div class="progress-foot small muted">
          <span :class="['status-msg', `text-${status}`]">{{ statusText }}</span>
          <span>已用 {{ (shopping.budgetUsedRatio * 100).toFixed(0) }}%</span>
        </div>
      </div>

      <!-- 紧凑模式：内联预警文案 -->
      <div v-else class="compact-msg" :class="`text-${status}`">{{ statusText }}</div>
    </div>

    <div v-if="variant === 'compact' && status === 'over'" class="over-tip muted small">
      超出预算 ¥{{ (overRatio * budget).toFixed(1) }}，建议核对近期采购记录
    </div>
  </div>

  <!-- 设置 / 调整预算弹窗 -->
  <BaseModal :show="showEditor" title="设置每月买菜预算" @close="showEditor = false">
    <div class="editor">
      <p class="muted small editor-tip">
        每月 1 日自动重新计算。完成采购后当月支出会自动累加，可随时在此调整额度。
      </p>
      <label class="field-label">每月买菜额度（元）</label>
      <div class="field">
        <span class="yuan">¥</span>
        <input
          v-model="draftBudget"
          type="number"
          min="0"
          step="10"
          placeholder="例如：800"
          autofocus
        />
      </div>
      <div v-if="budget" class="current muted small">当前预算：¥{{ budget.toFixed(1) }}</div>
    </div>
    <template #footer>
      <BaseButton v-if="budget" variant="ghost" @click="clearBudget">清除预算</BaseButton>
      <BaseButton variant="ghost" @click="showEditor = false">取消</BaseButton>
      <BaseButton @click="save">保存</BaseButton>
    </template>
  </BaseModal>
</template>

<style scoped>
.budget-entry {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--surface);
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.budget-entry:hover {
  border-color: var(--primary);
  background: var(--primary-light);
}
.budget-entry.is-compact {
  padding: 10px 14px;
}
.entry-icon {
  font-size: 22px;
}
.entry-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.entry-arrow {
  color: var(--text-2);
}

.budget-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 4px solid var(--primary);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 16px;
}
.budget-card.status-near {
  border-left-color: var(--warn);
  background: var(--warn-light);
}
.budget-card.status-over {
  border-left-color: var(--danger);
  background: var(--danger-light);
}
.budget-card.is-compact {
  padding: 12px 16px;
}

.budget-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.budget-title {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}
.is-compact .budget-head {
  margin-bottom: 6px;
}

.budget-body {
  display: flex;
  align-items: center;
  gap: 20px;
}
.is-compact .budget-body {
  gap: 16px;
}
.amounts {
  flex-shrink: 0;
}
.amount-main {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.amount-main .label {
  font-size: 13px;
  color: var(--text-2);
}
.amount-main .value {
  font-size: 26px;
  font-weight: 700;
  color: var(--primary-dark);
}
.status-near .amount-main .value {
  color: #e65100;
}
.status-over .amount-main .value {
  color: var(--danger);
}
.is-compact .amount-main .value {
  font-size: 20px;
}
.amount-sub {
  margin-top: 2px;
}

.progress {
  flex: 1;
  min-width: 0;
}
.bar {
  height: 10px;
  border-radius: 5px;
  background: var(--surface-2);
  overflow: hidden;
}
.fill {
  height: 100%;
  border-radius: 5px;
  background: var(--primary);
  transition: width 0.3s ease;
}
.fill.near {
  background: var(--warn);
}
.fill.over {
  background: var(--danger);
}
.progress-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
}

.compact-msg {
  font-size: 13px;
  font-weight: 500;
}
.over-tip {
  margin-top: 6px;
}

.text-ok {
  color: var(--primary-dark);
}
.text-near {
  color: #e65100;
}
.text-over {
  color: var(--danger);
}

.small {
  font-size: 12px;
}

/* 弹窗表单 */
.editor-tip {
  margin: 0 0 14px;
}
.field-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 6px;
}
.field {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
}
.field:focus-within {
  border-color: var(--primary);
}
.field .yuan {
  color: var(--text-2);
}
.field input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 16px;
  width: 100%;
}
.current {
  margin-top: 10px;
}
</style>
