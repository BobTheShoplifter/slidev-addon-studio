<script setup lang="ts">
defineProps<{ label: string }>()
</script>

<template>
  <label class="studio-field">
    <span class="studio-field__label">{{ label }}</span>
    <span class="studio-field__control"><slot /></span>
  </label>
</template>
