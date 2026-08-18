import type { SourceRange } from '../types'
import { getBlock, replaceBlock } from './lines'
import { findAttr, firstTag, writeAttr } from './tags'

/**
 * Motion presets on top of `@vueuse/motion`, which Slidev registers as
 * `v-motion`. Click animations cover "appear on step N"; motion covers how a
 * thing moves once it is there. Both can be on the same element.
 *
 * Motion needs a real element to bind to, so it is only offered for blocks
 * that open with a tag.
 */

export interface MotionPreset {
  id: string
  label: string
  initial: Record<string, unknown>
  enter: Record<string, unknown>
}

export const MOTION_PRESETS: MotionPreset[] = [
  { id: 'slide-up', label: 'Slide up', initial: { y: 60, opacity: 0 }, enter: { y: 0, opacity: 1 } },
  { id: 'slide-down', label: 'Slide down', initial: { y: -60, opacity: 0 }, enter: { y: 0, opacity: 1 } },
  { id: 'slide-left', label: 'Slide from left', initial: { x: -80, opacity: 0 }, enter: { x: 0, opacity: 1 } },
  { id: 'slide-right', label: 'Slide from right', initial: { x: 80, opacity: 0 }, enter: { x: 0, opacity: 1 } },
  { id: 'zoom', label: 'Zoom in', initial: { scale: 0.85, opacity: 0 }, enter: { scale: 1, opacity: 1 } },
  { id: 'pop', label: 'Pop', initial: { scale: 0.6, opacity: 0 }, enter: { scale: 1, opacity: 1, transition: { type: 'spring', stiffness: 260, damping: 18 } } },
  { id: 'tilt', label: 'Tilt in', initial: { rotate: -6, y: 30, opacity: 0 }, enter: { rotate: 0, y: 0, opacity: 1 } },
]

export function readMotion(content: string, range: SourceRange): string | null {
  const block = getBlock(content, range)
  if (firstTag(block)?.start !== 0)
    return null
  const initial = findAttr(block, 'initial')
  if (!initial?.value)
    return null
  const match = MOTION_PRESETS.find(preset => normalise(preset.initial) === normalise(parseObject(initial.value!)))
  return match?.id ?? 'custom'
}

export function writeMotion(content: string, range: SourceRange, presetId: string | null, delay = 0): string {
  const block = getBlock(content, range)
  if (firstTag(block)?.start !== 0)
    return content

  if (!presetId) {
    let next = writeAttr(block, 'motion', null)
    next = writeAttr(next, 'initial', null)
    next = writeAttr(next, 'enter', null)
    return replaceBlock(content, range, next)
  }

  const preset = MOTION_PRESETS.find(p => p.id === presetId)
  if (!preset)
    return content

  const enter = delay > 0
    ? { ...preset.enter, transition: { ...(preset.enter.transition as object ?? {}), delay } }
    : preset.enter

  let next = writeAttr(block, 'motion', true)
  next = writeAttr(next, 'initial', stringify(preset.initial), { bound: true })
  next = writeAttr(next, 'enter', stringify(enter), { bound: true })
  return replaceBlock(content, range, next)
}

/** Vue attribute values live in double quotes, so object literals use single. */
function stringify(value: Record<string, unknown>) {
  return JSON.stringify(value).replace(/"/g, '\'')
}

function parseObject(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw.replace(/'/g, '"'))
  }
  catch {
    return {}
  }
}

function normalise(value: Record<string, unknown>) {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))))
}
