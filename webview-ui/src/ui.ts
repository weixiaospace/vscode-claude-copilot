// webview-ui/src/ui.ts
// Shared, framework-free component vocabulary for all webview panels.
// Each helper returns an HTML string; event binding stays per-panel via data-* / id hooks.

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

// ---- design tokens ----
export const T = {
  border: 'border-current/20',
  borderSubtle: 'border-current/15',
  borderFaint: 'border-current/10',
  input: 'w-full bg-transparent border border-current/20 rounded px-2 py-1.5 text-sm',
  inputMono: 'w-full bg-transparent border border-current/20 rounded px-2 py-1 text-sm font-mono',
  card: 'rounded-lg border border-current/15',
} as const;

export type BtnVariant = 'primary' | 'secondary' | 'ghost';

// NOTE: `attrs` (button) and `attr` (numberInput) are pre-built raw attribute-string
// fragments interpolated UNESCAPED into the markup. Callers MUST escape any
// user-controlled values themselves before passing them in.
export function button(o: { label: string; id?: string; variant?: BtnVariant; size?: 'sm' | 'md'; disabled?: boolean; attrs?: string }): string {
  const size = o.size === 'sm' ? 'text-xs px-3 py-1' : 'text-sm px-4 py-1.5';
  const variant =
    o.variant === 'primary' ? 'border border-current/40 bg-current/10 hover:bg-current/20'
    : o.variant === 'ghost' ? 'opacity-70 hover:opacity-100'
    : 'border border-current/20 hover:bg-current/5';
  return `<button ${o.id ? `id="${o.id}"` : ''} ${o.disabled ? 'disabled' : ''} ${o.attrs ?? ''}
    class="rounded ${size} ${variant} disabled:opacity-40">${escapeHtml(o.label)}</button>`;
}

export function badge(text: string, o?: { variant?: 'default' | 'active' | 'warn' }): string {
  const v = o?.variant === 'active'
    ? 'text-[var(--vscode-textLink-foreground)] border-[var(--vscode-textLink-foreground)]/40'
    : o?.variant === 'warn' ? 'border-yellow-500/40 text-yellow-500' : 'border-current/30 opacity-80';
  return `<span class="text-[11px] px-2 py-0.5 rounded-full border ${v}">${escapeHtml(text)}</span>`;
}

export function card(inner: string, o?: { muted?: boolean; cls?: string }): string {
  return `<div class="${T.card} p-4 ${o?.muted ? 'bg-current/[0.03]' : ''} ${o?.cls ?? ''}">${inner}</div>`;
}

export function sectionHeader(title: string, desc?: string): string {
  return `<div>
    <h2 class="text-sm font-semibold uppercase tracking-wider opacity-75">${escapeHtml(title)}</h2>
    ${desc ? `<p class="text-xs opacity-55 mt-1">${escapeHtml(desc)}</p>` : ''}
  </div>`;
}

export function field(o: { label: string; hint?: string; control: string }): string {
  return `<div class="space-y-1.5">
    <div class="text-sm font-medium">${escapeHtml(o.label)}</div>
    ${o.hint ? `<div class="text-xs opacity-60">${escapeHtml(o.hint)}</div>` : ''}
    ${o.control}
  </div>`;
}

export function emptyState(text: string): string {
  return `<div class="text-sm opacity-60 py-4 text-center">${escapeHtml(text)}</div>`;
}

export function switchRow(o: { id: string; checked: boolean; label: string; desc?: string }): string {
  return `<label class="flex items-start gap-3 py-2 cursor-pointer">
    <span class="relative inline-block mt-0.5 shrink-0">
      <input type="checkbox" id="${o.id}" ${o.checked ? 'checked' : ''} class="peer sr-only" />
      <span class="block w-9 h-5 rounded-full bg-current/20 peer-checked:bg-blue-500 transition-colors"></span>
      <span class="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4"></span>
    </span>
    <span class="flex-1 min-w-0">
      <span class="block text-sm">${escapeHtml(o.label)}</span>
      ${o.desc ? `<span class="block text-xs opacity-60 mt-0.5">${escapeHtml(o.desc)}</span>` : ''}
    </span>
  </label>`;
}

export function toggleGroup(o: { id: string; options: { value: string; label: string }[]; active: string }): string {
  return `<div class="inline-flex flex-wrap gap-1" data-toggle="${o.id}">${o.options.map(opt => `
    <button data-val="${escapeHtml(opt.value)}" class="px-3 py-1 text-xs rounded-md border transition-colors ${o.active === opt.value
      ? 'bg-current/15 border-current/40 font-medium'
      : 'bg-transparent border-current/20 opacity-70 hover:bg-current/5'}">${escapeHtml(opt.label)}</button>`).join('')}</div>`;
}

export function select(o: { id: string; options: { value: string; label: string; selected: boolean }[]; cls?: string }): string {
  return `<select id="${o.id}" class="${o.cls ?? T.input}">${o.options.map(opt =>
    `<option value="${escapeHtml(opt.value)}" ${opt.selected ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`).join('')}</select>`;
}

export function numberInput(o: { attr: string; value: number | ''; cls?: string }): string {
  return `<input type="number" ${o.attr} value="${o.value === '' ? '' : o.value}" min="0" class="${o.cls ?? 'w-40 bg-transparent border border-current/20 rounded px-2 py-1 text-sm font-mono'}" />`;
}

export function textInput(o: { id?: string; attr?: string; value: string; placeholder?: string; cls?: string }): string {
  return `<input type="text" ${o.id ? `id="${o.id}"` : ''} ${o.attr ?? ''} value="${escapeHtml(o.value)}" placeholder="${escapeHtml(o.placeholder ?? '')}" class="${o.cls ?? T.inputMono}" />`;
}

export function modal(o: { title: string; body: string; footer: string; closeId?: string }): string {
  return `<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div role="dialog" aria-modal="true" class="relative w-full max-w-lg max-h-[85vh] overflow-auto rounded-lg border border-current/20 bg-[var(--vscode-editor-background)] shadow-2xl p-5 space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-base font-semibold">${escapeHtml(o.title)}</h3>
        <button ${o.closeId ? `id="${o.closeId}"` : ''} aria-label="Close" class="text-lg leading-none opacity-60 hover:opacity-100 px-1">×</button>
      </div>
      <div class="space-y-3">${o.body}</div>
      <div class="flex gap-2 justify-end pt-2">${o.footer}</div>
    </div>
  </div>`;
}
