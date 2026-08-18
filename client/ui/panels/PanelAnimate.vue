<script setup lang="ts">
import type { ClickState } from '../../md/clicks'
import { useNav } from '@slidev/client'
import { computed, ref, watch } from 'vue'
import { useStudio } from '../../context'
import { CLICK_ANIMATIONS, EMPTY_CLICKS, readClicks, writeClicks } from '../../md/clicks'
import { MOTION_PRESETS, readMotion, writeMotion } from '../../md/motion'
import { selection } from '../../state'
import StudioField from '../parts/StudioField.vue'

/**
 * The animation panel.
 *
 * Slidev's model is a sequence of clicks per slide, so the panel leads with
 * that sequence, which you can scrub to move the slide with you, and then edits how
 * the selected block joins in.
 */
const studio = useStudio()
const nav = useNav()

const clicks = computed(() => nav.clicksContext.value)
const total = computed(() => clicks.value.total)
const current = computed(() => clicks.value.current)

const range = computed(() => selection.value?.range ?? null)
const state = ref<ClickState>({ ...EMPTY_CLICKS })
const motion = ref<string | null>(null)
const motionDelay = ref(0)

watch([range, () => studio.content()], () => {
  if (!range.value) {
    state.value = { ...EMPTY_CLICKS }
    motion.value = null
    return
  }
  state.value = readClicks(studio.content(), range.value)
  motion.value = readMotion(studio.content(), range.value)
}, { immediate: true })

const canStagger = computed(() => selection.value?.kind === 'list')
const canMotion = computed(() => !!selection.value?.tag)

async function apply(patch: Partial<ClickState>) {
  if (!range.value)
    return
  const next: ClickState = { ...state.value, ...patch, via: patch.via ?? (state.value.via === 'none' ? 'attr' : state.value.via) }
  await studio.commit(writeClicks(studio.content(), range.value, next), 'Set animation')
}

async function disable() {
  if (!range.value)
    return
  await studio.commit(writeClicks(studio.content(), range.value, { ...state.value, via: 'none' }), 'Remove animation')
}

async function applyMotion(preset: string) {
  if (!range.value)
    return
  await studio.commit(
    writeMotion(studio.content(), range.value, preset || null, motionDelay.value),
    preset ? 'Set motion' : 'Remove motion',
  )
}

function scrub(value: number) {
  nav.go(studio.no(), value)
}

async function setTransition(value: string) {
  await studio.setFrontmatter({ transition: value || null }, 'Set transition')
}

const TRANSITIONS = ['', 'fade', 'fade-out', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'view-transition', 'none']
</script>

<template>
  <section class="studio-section">
    <h3 class="studio-section__title">
      Click sequence
    </h3>
    <p class="studio-hint" style="margin-bottom: 8px">
      Step {{ current }} of {{ total }} on this slide
    </p>
    <input
      type="range"
      :min="clicks.clicksStart"
      :max="Math.max(total, clicks.clicksStart)"
      :value="current"
      style="width: 100%"
      @input="scrub(+($event.target as HTMLInputElement).value)"
    >
  </section>

  <div v-if="!selection || !range" class="studio-empty">
    Select something on the slide to animate it.
  </div>

  <template v-else>
    <section class="studio-section">
      <h3 class="studio-section__title">
        {{ selection.label }} reveal
      </h3>

      <StudioField label="Appears">
        <select :value="state.via === 'none' ? 'never' : 'click'" @change="($event.target as HTMLSelectElement).value === 'never' ? disable() : apply({ via: 'attr' })">
          <option value="never">With the slide</option>
          <option value="click">On a click</option>
        </select>
      </StudioField>

      <template v-if="state.via !== 'none'">
        <StudioField label="At step">
          <input
            type="text"
            :value="state.at"
            placeholder="+1"
            title="An absolute step (3) or one relative to the previous (+1)"
            @change="apply({ at: ($event.target as HTMLInputElement).value || '+1' })"
          >
        </StudioField>

        <StudioField label="Animation">
          <select :value="state.animation" @change="apply({ animation: ($event.target as HTMLSelectElement).value })">
            <option v-for="option in CLICK_ANIMATIONS" :key="option.id" :value="option.id">
              {{ option.label }}
            </option>
          </select>
        </StudioField>

        <StudioField label="Direction">
          <select :value="state.hide ? 'hide' : 'show'" @change="apply({ hide: ($event.target as HTMLSelectElement).value === 'hide' })">
            <option value="show">Reveal at this step</option>
            <option value="hide">Hide at this step</option>
          </select>
        </StudioField>

        <template v-if="canStagger">
          <StudioField label="Children">
            <select :value="state.stagger ? 'stagger' : 'together'" @change="apply({ stagger: ($event.target as HTMLSelectElement).value === 'stagger' })">
              <option value="together">Reveal together</option>
              <option value="stagger">One at a time</option>
            </select>
          </StudioField>
          <template v-if="state.stagger">
            <StudioField label="Per step">
              <input type="number" min="1" :value="state.every" @change="apply({ every: +($event.target as HTMLInputElement).value || 1 })">
            </StudioField>
            <StudioField label="Nesting">
              <input type="number" min="1" max="5" :value="state.depth" @change="apply({ depth: +($event.target as HTMLInputElement).value || 1 })">
            </StudioField>
          </template>
        </template>
      </template>
    </section>

    <section class="studio-section">
      <h3 class="studio-section__title">
        Motion
      </h3>
      <template v-if="canMotion">
        <StudioField label="Preset">
          <select :value="motion ?? ''" @change="applyMotion(($event.target as HTMLSelectElement).value)">
            <option value="">
              None
            </option>
            <option v-for="preset in MOTION_PRESETS" :key="preset.id" :value="preset.id">
              {{ preset.label }}
            </option>
          </select>
        </StudioField>
        <StudioField v-if="motion" label="Delay (ms)">
          <input v-model.number="motionDelay" type="number" min="0" step="50" @change="applyMotion(motion!)">
        </StudioField>
      </template>
      <p v-else class="studio-hint">
        Motion attaches to an element or component. Wrap this block in one to animate it.
      </p>
    </section>
  </template>

  <section class="studio-section">
    <h3 class="studio-section__title">
      Slide transition
    </h3>
    <StudioField label="Leaving">
      <select :value="studio.frontmatter().transition ?? ''" @change="setTransition(($event.target as HTMLSelectElement).value)">
        <option v-for="option in TRANSITIONS" :key="option" :value="option">
          {{ option || 'Inherit from deck' }}
        </option>
      </select>
    </StudioField>
  </section>
</template>
