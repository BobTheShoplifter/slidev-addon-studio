<template>
  <div class="note">
    <slot />
  </div>
</template>

<style scoped>
.note {
  max-width: 32em;
  padding: 1em 1.2em;
  border-left: 3px solid #4f8cff;
  border-radius: 4px;
  background: rgba(79, 140, 255, 0.08);
  text-align: left;
}
</style>

<studio lang="yaml">
description: A bordered callout
category: Playground
snippet: |
  <Note>Something worth pointing at.</Note>
</studio>
