<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { configs } from '@slidev/client/env.ts'
import { useStudio } from '../../context'
import { parsePos, readDrag, removeDrag, writeDrag } from '../../md/drag'
import { getBlock, moveBlock, removeBlock, insertAfter, replaceBlock } from '../../md/lines'
import { readClasses, writeClasses } from '../../md/classes'
import { selection } from '../../state'
import StudioField from '../parts/StudioField.vue'
import StudioIcon from '../parts/StudioIcon.vue'

/**
 * The properties panel: where the selected block lives, how it is styled, and
 * the raw Markdown behind it. Every control writes the smallest possible edit
 * back to the slide.
 */
const studio = useStudio()

const range = computed(() => selection.value?.range ?? null)
const block = computed(() => (range.value ? getBlock(studio.content(), range.value) : ''))
const drag = computed(() => (range.value ? readDrag(studio.content(), range.value) : null))
const pos = computed(() => drag.value?.pos ?? null)

const draft = ref('')
watch(block, value => (draft.value = value), { immediate: true })
const dirty = computed(() => draft.value !== block.value)

const classes = ref('')
watch([block, range], () => {
  classes.value = range.value ? readClasses(studio.content(), range.value) : ''
}, { immediate: true })

async function setPos(field: 'x' | 'y' | 'w' | 'h' | 'rotate', value: number) {
  if (!range.value || !pos.value)
    return
  await studio.commit(
    writeDrag(studio.content(), range.value, { ...pos.value, [field]: value }),
    'Set position',
  )
}

async function toFreePosition() {
  if (!range.value || !selection.value)
    return
  const box = studio.canvas.boxOf(selection.value.el)
  await studio.commit(
    writeDrag(studio.content(), range.value, { x: box.x, y: box.y, w: box.w, h: null, rotate: 0 }),
    'Free position',
  )
}

async function toFlow() {
  if (!range.value)
    return
  await studio.commit(removeDrag(studio.content(), range.value), 'Return to flow')
}

async function applyClasses() {
  if (!range.value)
    return
  await studio.commit(writeClasses(studio.content(), range.value, classes.value), 'Set classes')
}

async function applyDraft() {
  if (!range.value || !dirty.value)
    return
  await studio.commit(replaceBlock(studio.content(), range.value, draft.value), 'Edit block')
}

async function move(direction: -1 | 1) {
  if (!range.value)
    return
  await studio.commit(moveBlock(studio.content(), range.value, direction), 'Reorder block')
}

async function duplicate() {
  if (!range.value)
    return
  await studio.commit(insertAfter(studio.content(), range.value, block.value), 'Duplicate block')
}

async function remove() {
  if (!range.value)
    return
  await studio.commit(removeBlock(studio.content(), range.value), 'Delete block')
  selection.value = null
}
</script>

<template>
  <div v-if="!selection" class="studio-empty">
    Click anything on the slide to select it.
  </div>

  <div v-else-if="!range" class="studio-empty">
    <p>This element could not be traced back to the Markdown.</p>
    <p class="studio-hint">
      That happens when a custom Markdown transformer moves lines around. The
      element still renders, it just cannot be edited visually.
    </p>
  </div>

  <template v-else>
    <section class="studio-section">
      <h3 class="studio-section__title">
        {{ selection.label }}
      </h3>
      <p class="studio-hint">
        Lines {{ range[0] + 1 }}–{{ range[1] }} of this slide
      </p>
    </section>

    <section class="studio-section">
      <h3 class="studio-section__title">
        Position
      </h3>
      <div v-if="!pos" class="studio-button-row">
        <button class="studio-button" @click="toFreePosition">
          <StudioIcon name="free" :size="14" /> Free position
        </button>
      </div>
      <template v-else>
        <StudioField label="X">
          <input type="number" :value="Math.round(pos.x)" @change="setPos('x', +($event.target as HTMLInputElement).value)">
        </StudioField>
        <StudioField label="Y">
          <input type="number" :value="Math.round(pos.y)" @change="setPos('y', +($event.target as HTMLInputElement).value)">
        </StudioField>
        <StudioField label="Width">
          <input type="number" :value="Math.round(pos.w)" @change="setPos('w', +($event.target as HTMLInputElement).value)">
        </StudioField>
        <StudioField label="Height">
          <input
            type="number"
            :value="pos.h === null ? '' : Math.round(pos.h)"
            placeholder="auto"
            @change="setPos('h', +($event.target as HTMLInputElement).value)"
          >
        </StudioField>
        <StudioField label="Rotation">
          <input type="number" :value="Math.round(pos.rotate)" @change="setPos('rotate', +($event.target as HTMLInputElement).value)">
        </StudioField>
        <button class="studio-button" @click="toFlow">
          <StudioIcon name="flow" :size="14" /> Return to flow
        </button>
        <p class="studio-hint">
          Free elements are positioned in canvas units ({{ studio.canvas.slideWidth.value }} wide).
        </p>
      </template>
    </section>

    <section class="studio-section">
      <h3 class="studio-section__title">
        Style
      </h3>
      <StudioField label="Classes">
        <input v-model="classes" type="text" placeholder="text-xl opacity-80" @change="applyClasses">
      </StudioField>
      <p v-if="!selection.tag && !configs.mdc" class="studio-hint">
        Classes on Markdown blocks need <code>mdc: true</code> in the headmatter.
      </p>
    </section>

    <section class="studio-section">
      <h3 class="studio-section__title">
        Arrange
      </h3>
      <div class="studio-button-row">
        <button class="studio-button" title="Move earlier" @click="move(-1)">
          <StudioIcon name="up" :size="14" />
        </button>
        <button class="studio-button" title="Move later" @click="move(1)">
          <StudioIcon name="down" :size="14" />
        </button>
        <button class="studio-button" title="Duplicate" @click="duplicate">
          <StudioIcon name="copy" :size="14" />
        </button>
        <button class="studio-button studio-button--danger" title="Delete" @click="remove">
          <StudioIcon name="trash" :size="14" />
        </button>
      </div>
    </section>

    <section class="studio-section">
      <h3 class="studio-section__title">
        Markdown
      </h3>
      <textarea v-model="draft" rows="6" spellcheck="false" />
      <div class="studio-button-row" style="margin-top: 6px">
        <button class="studio-button" :disabled="!dirty" @click="applyDraft">
          Apply
        </button>
        <button class="studio-button" :disabled="!dirty" @click="draft = block">
          Revert
        </button>
      </div>
    </section>
  </template>
</template>
