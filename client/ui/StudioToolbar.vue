<script setup lang="ts">
import type { PanelId } from '../state'
import { canRedo, canUndo, lastAction, useStudioHistory } from '../composables/useSlideSource'
import { activePanel, gridEnabled, outlineEnabled, snapEnabled, studioOpen } from '../state'
import StudioIcon from './parts/StudioIcon.vue'

const history = useStudioHistory()

const tabs: { id: PanelId, icon: string, label: string }[] = [
  { id: 'inspect', icon: 'cursor', label: 'Element' },
  { id: 'components', icon: 'components', label: 'Components' },
  { id: 'animate', icon: 'animate', label: 'Animate' },
  { id: 'layout', icon: 'layout', label: 'Layout' },
  { id: 'slides', icon: 'slides', label: 'Slides' },
  { id: 'assets', icon: 'assets', label: 'Assets' },
]
</script>

<template>
  <div class="studio-toolbar">
    <button
      class="studio-icon-button"
      :aria-pressed="studioOpen"
      title="Toggle Studio (E)"
      @click="studioOpen = !studioOpen"
    >
      <StudioIcon name="edit" />
    </button>

    <template v-if="studioOpen">
      <span class="studio-toolbar__divider" />

      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="studio-tab"
        role="tab"
        :aria-selected="activePanel === tab.id"
        :title="tab.label"
        @click="activePanel = tab.id"
      >
        <StudioIcon :name="tab.icon" :size="15" />
        <span>{{ tab.label }}</span>
      </button>

      <span class="studio-toolbar__divider" />

      <button
        class="studio-icon-button"
        :disabled="!canUndo"
        :title="lastAction ? `Undo ${lastAction.toLowerCase()}` : 'Undo'"
        @click="history.undo()"
      >
        <StudioIcon name="undo" />
      </button>
      <button class="studio-icon-button" :disabled="!canRedo" title="Redo" @click="history.redo()">
        <StudioIcon name="redo" />
      </button>

      <span class="studio-toolbar__divider" />

      <button
        class="studio-icon-button"
        :aria-pressed="snapEnabled"
        title="Snap to guides. Hold Alt to bypass"
        @click="snapEnabled = !snapEnabled"
      >
        <StudioIcon name="magnet" />
      </button>
      <button class="studio-icon-button" :aria-pressed="gridEnabled" title="Snap to grid" @click="gridEnabled = !gridEnabled">
        <StudioIcon name="grid" />
      </button>
      <button
        class="studio-icon-button"
        :aria-pressed="outlineEnabled"
        title="Outline everything selectable"
        @click="outlineEnabled = !outlineEnabled"
      >
        <StudioIcon name="eye" />
      </button>
    </template>
  </div>
</template>
