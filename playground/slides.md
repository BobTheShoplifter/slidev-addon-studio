---
theme: default
title: Slidev Studio playground
addons:
  - .
mdc: true
transition: fade
layout: center
---

# Slidev Studio

Press <kbd>E</kbd> to open the editor, then click anything on this slide.

---

# Click to select

Every block here maps back to a line in `playground/slides.md`.
Select one and the Element panel shows the exact Markdown behind it.

- Headings, paragraphs, lists and quotes
- Plain HTML elements
- Vue components

<Badge label="a component" />

---

# Props, without leaving the canvas

Select the shape and the Element panel offers its props. The picker below is not
hardcoded: `Shape.vue` declares that its `name` prop comes from `./shapes/*.svg`,
so the editor lists whatever is in that folder.

<Shape name="hexagon" :size="220" caption="A hexagon" v-drag="[56,153,220,NaN]" />

---

# Lists are rows, not blobs

A prop holding records is edited as one row per entry, with a field per key.
The fields come from the type the component declares, so an empty list still
knows what it wants.

<Milestones :items="[
  { year: '2019', text: 'First talk', highlight: false },
  { year: '2024', text: 'Fiftieth talk', highlight: true },
]" />

---
layout: center
---

# Drag anything

<Note>
Drag a block on the canvas and Studio gives it a free position, writing the
coordinates back into the Markdown. The Element panel sends it back into the
document flow whenever you want.
</Note>

---

# Animate

<v-click>

This heading's paragraph appears on a click, because the Animate panel wrapped
it in `<v-click>`.

</v-click>

<v-clicks>

- Lists can reveal one item at a time
- Which is a `<v-clicks>` wrapper
- With `every` and `depth` to tune it

</v-clicks>

---
layout: center
---

# Everything is just Markdown

Close the editor, open `playground/slides.md`, and every change you made is
there as an ordinary diff.

---

# Probe heading

Paragraph one of the probe.

- alpha
- beta

<Badge label="probe" />
