<script setup lang="ts">
import type { ClickState } from '../../md/clicks'
import { useNav } from '@slidev/client'
import { computed, ref, watch } from 'vue'
import { useStudio } from '../../context'
import { CLICK_ANIMATIONS, EMPTY_CLICKS, readClicks, writeClicks } from '../../md/clicks'
import { MOTION_PRESETS, readMotion, writeMotion } from '../../md/motion'
import { reportError, selection } from '../../state'
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

/** Every stop on this slide, the slide's own state included. */
const steps = computed(() => {
  const from = clicks.value.clicksStart
  const to = Math.max(total.value, from)
  return Array.from({ length: to - from + 1 }, (_, i) => from + i)
})
const state = ref<ClickState>({ ...EMPTY_CLICKS })
const motion = ref<string | null>(null)
const motionDelay = ref(0)

watch([range, () => studio.content()], () => {
  if (!range.value) {
    state.value = { ...EMPTY_CLICKS }
    motion.value = null
    motionDelay.value = 0
    return
  }
  state.value = readClicks(studio.content(), range.value)
  const current = readMotion(studio.content(), range.value)
  motion.value = current.preset
  motionDelay.value = current.delay
}, { immediate: true })

const canStagger = computed(() => selection.value?.kind === 'list')
const canMotion = computed(() => !!selection.value?.tag)

async function apply(patch: Partial<ClickState>) {
  if (!range.value)
    return

  /*
   * A reveal asked for on one item of a list is applied to the list.
   *
   * The reveal is written as a `<v-click>` wrapper around the block's lines,
   * and around one item that splices an HTML block into the middle of the list:
   * it ends above and starts again below, so one list becomes three and an
   * ordered list restarts its numbering halfway down.
   *
   * Refusing would be a dead end, because the items fill the list and a click
   * on one always lands on the item rather than on the list. What the author
   * means is the thing Slidev writes as `<v-clicks>`: the list revealing its
   * items one at a time. That is what this does, and it says so.
   */
  let target = range.value
  if (selection.value?.kind === 'list-item') {
    const list = selection.value.el.closest<HTMLElement>('[data-studio-kind="list"]')
    const at = list?.dataset.studioSrc?.split(',').map(Number)
    if (!at || at.length !== 2 || !at.every(Number.isFinite)) {
      reportError(new Error('That item is in a list Studio cannot trace, so it cannot be revealed on a click.'))
      return
    }
    target = [at[0], at[1]]
    patch = { ...patch, stagger: true }
  }

  const next: ClickState = { ...state.value, ...patch, via: patch.via ?? (state.value.via === 'none' ? 'attr' : state.value.via) }
  await studio.commit(writeClicks(studio.content(), target, next), 'Set animation')
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

    <!--
      The steps themselves, rather than a slider over them. A slider says how
      far along you are; what an author wants to know is how many steps the
      slide has, which one they are on, and how to get to any of the others,
      and a dozen numbered stops answers all three at a glance.
    -->
    <div class="studio-steps" role="group" aria-label="Click sequence">
      <button
        v-for="step in steps"
        :key="step"
        class="studio-step"
        :class="{ 'is-current': step === current, 'is-done': step < current }"
        :title="step === clicks.clicksStart ? 'With the slide' : `Step ${step}`"
        @click="scrub(step)"
      >
        {{ step === clicks.clicksStart ? '0' : step }}
      </button>
    </div>

    <p class="studio-hint">
      {{ total > clicks.clicksStart
        ? `Step ${current} of ${total}. Click a number to jump there.`
        : 'Nothing on this slide waits for a click yet.' }}
    </p>
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
            <!-- A motion written by hand matches no preset. Naming it keeps the
                 control from reading as "None" over an element that moves. -->
            <option v-if="motion === 'custom'" value="custom" disabled>
              Custom, written by hand
            </option>
          </select>
        </StudioField>
        <StudioField v-if="motion && motion !== 'custom'" label="Delay (ms)">
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

<style scoped>
.studio-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}

/*
 * Sized to the digits it holds so a deck with a dozen steps still lines up,
 * and square-ish rather than round: a step is a position in a sequence, not a
 * bullet.
 */
.studio-step {
  min-width: 26px;
  height: 26px;
  padding: 0 6px;
  border: 1px solid var(--studio-border);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  opacity: 0.55;
  transition: opacity 0.12s ease, background 0.12s ease, border-color 0.12s ease;
}

.studio-step:hover { opacity: 1; }

/* Already passed, so it reads as behind you rather than as unavailable. */
.studio-step.is-done {
  opacity: 0.85;
  border-color: var(--studio-accent);
  background: var(--studio-accent-soft);
}

.studio-step.is-current {
  opacity: 1;
  background: var(--studio-accent);
  border-color: var(--studio-accent);
  color: #fff;
}
</style>
