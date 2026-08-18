<script setup lang="ts">
import type { StudioAsset } from '../../types'
import { onMounted, ref } from 'vue'
import { assetApi, readAsBase64 } from '../../composables/useDeckApi'
import { useStudio } from '../../context'
import { assetSnippet, insertSnippet, positioned } from '../../md/insert'
import { selection } from '../../state'

/**
 * The asset drawer, backed by the deck's own `public/` directory. A dropped
 * image becomes a file in the repository and a plain `/name.png` reference in
 * the slide. Nothing here depends on Studio being installed later.
 */
const studio = useStudio()

const assets = ref<StudioAsset[]>([])
const root = ref('')
const over = ref(false)
const uploading = ref(false)

async function refresh() {
  const result = await assetApi.list()
  assets.value = result?.assets ?? []
  root.value = result?.root ?? ''
}

onMounted(refresh)

async function upload(files: FileList | null) {
  if (!files?.length)
    return
  uploading.value = true
  try {
    for (const file of files)
      await assetApi.upload(file.name, await readAsBase64(file))
    await refresh()
  }
  finally {
    uploading.value = false
  }
}

async function insert(asset: StudioAsset) {
  const range = selection.value?.range
  await studio.commit(
    insertSnippet(studio.content(), assetSnippet(asset), range ? { mode: 'after', range } : { mode: 'append' }),
    `Insert ${asset.name}`,
  )
}

async function place(asset: StudioAsset) {
  const snippet = positioned(assetSnippet(asset), { x: 80, y: 80, w: 320, h: null, rotate: 0 })
  await studio.commit(insertSnippet(studio.content(), snippet, { mode: 'append' }), `Place ${asset.name}`)
}
</script>

<template>
  <label
    class="studio-dropzone"
    :class="{ 'studio-dropzone--over': over }"
    @dragover.prevent="over = true"
    @dragleave="over = false"
    @drop.prevent="over = false; upload(($event.dataTransfer as DataTransfer).files)"
  >
    <input type="file" multiple accept="image/*,video/*" hidden @change="upload(($event.target as HTMLInputElement).files)">
    {{ uploading ? 'Uploading…' : 'Drop images here, or click to choose' }}
  </label>

  <div v-if="!assets.length" class="studio-empty">
    <p>Nothing here yet.</p>
    <p class="studio-hint">
      Assets live next to the deck, in <code>{{ root || 'public/' }}</code>.
      Dropping a file creates the directory.
    </p>
  </div>

  <div v-else class="studio-grid">
    <button
      v-for="asset in assets"
      :key="asset.url"
      class="studio-asset"
      :title="`${asset.url}. Click to insert, shift-click to place freely`"
      @click="$event.shiftKey ? place(asset) : insert(asset)"
    >
      <img v-if="asset.kind === 'image'" :src="asset.url" :alt="asset.name" loading="lazy">
      <span class="studio-asset__name">{{ asset.name }}</span>
    </button>
  </div>
</template>
