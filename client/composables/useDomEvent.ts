import { onScopeDispose } from 'vue'

/**
 * A direct `addEventListener` bound to the current effect scope.
 *
 * Studio listens on `document` in the capture phase to claim a click before
 * the slide's own handlers see it, which is fiddly enough that it is worth
 * owning outright rather than routing through a helper whose binding rules
 * could change under us.
 */
export function onDomEvent<T extends Event = Event>(
  target: EventTarget,
  type: string,
  handler: (event: T) => void,
  options?: AddEventListenerOptions,
) {
  const listener = handler as EventListener
  target.addEventListener(type, listener, options)
  onScopeDispose(() => target.removeEventListener(type, listener, options))
}
