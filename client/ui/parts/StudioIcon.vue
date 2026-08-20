<script setup lang="ts">
/**
 * Icons are inlined rather than pulled from an icon set: Studio renders inside
 * someone else's build, and a missing icon collection is a confusing failure
 * for something this peripheral.
 */
const props = withDefaults(defineProps<{ name: string, size?: number }>(), { size: 16 })

const paths: Record<string, string> = {
  cursor: 'M5 3l14 8-6 1.5L10 19z',
  components: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  animate: 'M12 3v4M12 17v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M3 12h4M17 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8',
  layout: 'M3 4h18v16H3zM3 9h18M9 9v11',
  slides: 'M3 5h13v10H3zM7 19h13V9',
  assets: 'M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6',
  undo: 'M4 9h10a5 5 0 010 10H9M4 9l4-4M4 9l4 4',
  redo: 'M20 9H10a5 5 0 000 10h5M20 9l-4-4M20 9l-4 4',
  close: 'M6 6l12 12M18 6L6 18',
  magnet: 'M6 4v7a6 6 0 0012 0V4M6 9h5M13 9h5',
  grid: 'M3 9h18M3 15h18M9 3v18M15 3v18',
  plus: 'M12 5v14M5 12h14',
  copy: 'M9 9h11v11H9zM4 15V4h11',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  up: 'M12 19V5M5 12l7-7 7 7',
  down: 'M12 5v14M5 12l7 7 7-7',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7zM12 15a3 3 0 100-6 3 3 0 000 6z',
  free: 'M4 4h6v6H4zM14 14h6v6h-6zM10 10l4 4',
  flow: 'M4 6h16M4 12h10M4 18h16',
  edit: 'M4 20h4L19 9l-4-4L4 16z',
  play: 'M7 4l12 8-12 8z',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM4 12h2M18 12h2M12 4v2M12 18v2',
  bold: 'M7 5h6a3.5 3.5 0 010 7H7zM7 12h7a3.5 3.5 0 010 7H7z',
  italic: 'M10 5h8M6 19h8M14 5l-4 14',
  code: 'M9 8l-5 4 5 4M15 8l5 4-5 4',
  strike: 'M5 12h14M8 8a3 3 0 013-3h2a3 3 0 013 3M8 16a3 3 0 003 3h2a3 3 0 003-3',
  underline: 'M7 5v6a5 5 0 0010 0V5M5 19h14',
  link: 'M10 13a4 4 0 006 .5l2-2a4 4 0 00-6-6l-1 1M14 11a4 4 0 00-6-.5l-2 2a4 4 0 006 6l1-1',
  h1: 'M4 6v12M12 6v12M4 12h8M17 18v-8l-2 1.5',
  h2: 'M4 6v12M11 6v12M4 12h7M15 10a2 2 0 114 0c0 2-4 3-4 6h4',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  quote: 'M7 7h4v6H7zM13 7h4v6h-4zM7 13c0 2 1 3 3 4M13 13c0 2 1 3 3 4',
  check: 'M5 13l4 4L19 7',
}
</script>

<template>
  <svg
    :width="props.size"
    :height="props.size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[props.name] ?? paths.cursor" />
  </svg>
</template>
