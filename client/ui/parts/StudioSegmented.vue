<script setup lang="ts" generic="T extends string | number">
defineProps<{
  modelValue: T
  options: { value: T, label: string, title?: string }[]
}>()

const emit = defineEmits<{ 'update:modelValue': [value: T] }>()
</script>

<template>
  <div class="studio-segmented">
    <button
      v-for="option in options"
      :key="String(option.value)"
      type="button"
      :title="option.title"
      :aria-pressed="option.value === modelValue"
      @click="emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
