<script setup lang="ts">
import { computed, ref } from 'vue'
import { studioPalette } from '../../composables/useCatalog'
import { isColorValue } from '../../md/literals'

/**
 * A colour, with a real picker and the value as text.
 *
 * The text stays because deck colours are usually theme variables such as
 * `var(--flag-red)`, which no native picker can express. The picker seeds
 * itself from whatever that variable currently resolves to, so opening it on a
 * variable starts from the right colour rather than from black, and choosing
 * one writes a hex the user can see.
 */
const props = defineProps<{ value: string }>()
const emit = defineEmits<{ change: [value: string] }>()

const picker = ref<HTMLInputElement | null>(null)
const open_ = ref(false)
const paintable = computed(() => isColorValue(props.value))

/**
 * The theme declares its palette once, as custom properties, so those are the
 * colours worth proposing: choosing one keeps the deck referring to the theme
 * rather than freezing a hex that stops following it.
 */
const palette = computed(() => studioPalette)

/** Resolves `var(--x)` and named colours to the hex a colour input needs. */
function resolved(): string {
  if (/^#[0-9a-f]{6}$/i.test(props.value))
    return props.value

  const probe = document.createElement('span')
  probe.style.color = props.value || '#000000'
  probe.style.display = 'none'
  const host = document.getElementById('slide-content') ?? document.body
  host.appendChild(probe)
  const computedColor = getComputedStyle(probe).color
  probe.remove()

  const rgb = computedColor.match(/\d+/g)
  if (!rgb || rgb.length < 3)
    return '#000000'
  return `#${rgb.slice(0, 3).map(n => Number(n).toString(16).padStart(2, '0')).join('')}`
}

function pick() {
  if (!picker.value)
    return
  picker.value.value = resolved()
  picker.value.click()
}

function choose(value: string) {
  open_.value = false
  emit('change', value)
}
</script>

<template>
  <span class="studio-color">
    <button
      class="studio-color__swatch"
      :style="paintable ? { background: value } : undefined"
      :title="palette.length ? 'Choose a colour' : 'Pick a colour'"
      @click="palette.length ? (open_ = !open_) : pick()"
    />
    <input
      ref="picker"
      type="color"
      class="studio-color__picker"
      @input="emit('change', ($event.target as HTMLInputElement).value)"
    >
    <input
      type="text"
      :value="value"
      placeholder="#4f8cff or var(--accent)"
      @change="emit('change', ($event.target as HTMLInputElement).value)"
    >

    <span v-if="open_" class="studio-palette">
      <button
        v-for="colour in palette"
        :key="colour.name"
        class="studio-palette__chip"
        :style="{ background: colour.value }"
        :title="`${colour.name} (${colour.resolved})`"
        @click="choose(colour.value)"
      />
      <button class="studio-palette__custom" @click="open_ = false; pick()">
        Custom…
      </button>
    </span>
  </span>
</template>
