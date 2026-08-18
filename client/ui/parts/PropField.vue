<script setup lang="ts">
import type { PropMeta } from '../../types'
import { computed } from 'vue'
import { isBoolean, isNumber } from '../../md/props'
import StudioField from './StudioField.vue'

/**
 * One control in the props editor, chosen from what the prop actually is.
 *
 * Options backed by image files get a picker showing the images themselves,
 * which is the difference between choosing "shield-3" from a dropdown and
 * seeing the mascot you are about to place.
 */
const props = defineProps<{ prop: PropMeta, value: string | boolean | null }>()
const emit = defineEmits<{ change: [value: string | boolean | null] }>()

const label = computed(() => props.prop.label ?? props.prop.name)
const hasThumbnails = computed(() => props.prop.options?.some(o => o.preview) ?? false)
const current = computed(() => (props.value === null ? '' : String(props.value)))
</script>

<template>
  <div v-if="hasThumbnails" class="studio-field studio-field--stacked">
    <span class="studio-field__label">{{ label }}</span>
    <div class="studio-thumbs">
      <button
        v-for="option in prop.options"
        :key="option.value"
        class="studio-thumb"
        :class="{ 'studio-thumb--active': option.value === current }"
        :title="option.value"
        @click="emit('change', option.value)"
      >
        <img v-if="option.preview" :src="option.preview" :alt="option.value" loading="lazy">
        <span v-else>{{ option.value }}</span>
      </button>
    </div>
  </div>

  <StudioField v-else-if="prop.options?.length" :label="label">
    <select :value="current" @change="emit('change', ($event.target as HTMLSelectElement).value)">
      <option value="">
        {{ prop.required ? 'Choose…' : 'Default' }}
      </option>
      <option v-for="option in prop.options" :key="option.value" :value="option.value">
        {{ option.value }}
      </option>
    </select>
  </StudioField>

  <StudioField v-else-if="isBoolean(prop)" :label="label">
    <select :value="value === true ? 'yes' : 'no'" @change="emit('change', ($event.target as HTMLSelectElement).value === 'yes')">
      <option value="no">
        No
      </option>
      <option value="yes">
        Yes
      </option>
    </select>
  </StudioField>

  <StudioField v-else-if="isNumber(prop)" :label="label">
    <input
      type="number"
      :value="current"
      :placeholder="prop.default ?? ''"
      @change="emit('change', ($event.target as HTMLInputElement).value)"
    >
  </StudioField>

  <StudioField v-else :label="label">
    <input
      type="text"
      :value="current"
      :placeholder="prop.default ?? prop.type ?? ''"
      @change="emit('change', ($event.target as HTMLInputElement).value)"
    >
  </StudioField>
</template>
