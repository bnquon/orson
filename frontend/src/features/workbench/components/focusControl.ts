export function focusControl(controlId: string) {
  window.requestAnimationFrame(() => document.getElementById(controlId)?.focus());
}
