# Accessibility Spec — Grainulation v1 Ecosystem


## Scope

This spec applies to all 8 grainulation tool UIs. Every tool must meet these requirements before v1 ships. The spec targets WCAG 2.1 Level AA compliance for the subset of criteria relevant to developer tool UIs.

## 1. ARIA Landmarks

Every tool UI must define these landmark regions so screen readers can navigate by section:

### Required landmarks

| Landmark     | ARIA role       | HTML element | Purpose                                      |
| ------------ | --------------- | ------------ | -------------------------------------------- |
| Main content | `main`          | `<main>`     | Primary content area (claim list, dashboard) |
| Navigation   | `navigation`    | `<nav>`      | Sidebar, tab bar, or breadcrumb              |
| Sidebar      | `complementary` | `<aside>`    | Secondary info (filters, metadata, help)     |
| Header       | `banner`        | `<header>`   | Tool name, status indicators, global actions |

### Implementation pattern

```html
<body>
  <header role="banner">
    <h1>Wheat — Sprint Manager</h1>
    <nav role="navigation" aria-label="Main navigation">
      <!-- sidebar links or tab bar -->
    </nav>
  </header>
  <main role="main" aria-label="Claim workspace">
    <!-- primary content -->
  </main>
  <aside role="complementary" aria-label="Filters and metadata">
    <!-- secondary content -->
  </aside>
</body>
```

### Rules

- Use semantic HTML elements (`<main>`, `<nav>`, `<aside>`, `<header>`) as the primary mechanism. Add explicit `role` attributes for backward compatibility with older assistive tech.
- Every landmark must have an `aria-label` when there are multiple of the same type (e.g., two `<nav>` elements).
- Do not nest `<main>` inside another landmark.

## 2. Keyboard Navigation

All tool UIs must be fully operable with keyboard only. No functionality should require a mouse.

### Required key bindings

| Key             | Action                                          | Context     |
| --------------- | ----------------------------------------------- | ----------- |
| `Tab`           | Move focus to next interactive element          | Global      |
| `Shift+Tab`     | Move focus to previous interactive element      | Global      |
| `Enter`         | Activate focused element (button, link, action) | Global      |
| `Space`         | Toggle checkbox, activate button                | Global      |
| `Escape`        | Dismiss modal, close dropdown, exit overlay     | Overlays    |
| `Arrow Up/Down` | Navigate within list, menu, or dropdown         | Lists/menus |
| `Home/End`      | Jump to first/last item in list                 | Lists       |

### Tab order rules

- Tab order must follow visual order (left-to-right, top-to-bottom in LTR layouts).
- Use `tabindex="0"` to make custom elements focusable.
- Use `tabindex="-1"` for elements that should be programmatically focusable but not in the tab order.
- Never use `tabindex` values greater than 0.
- Skip links: provide a "Skip to main content" link as the first focusable element if the page has substantial navigation before the main content.

### Focus indicator

- All focusable elements must have a visible focus indicator.
- Use `outline` (not `border`) for focus styles to avoid layout shifts.
- Minimum focus indicator: 2px solid outline with sufficient contrast against the background.

```css
:focus-visible {
  outline: 2px solid #6ea8fe;
  outline-offset: 2px;
}
```

## 3. Focus Management

### Modal dialogs

When a modal opens:

1. Move focus to the first focusable element inside the modal (or the modal container if no focusable elements).
2. Trap focus inside the modal — Tab and Shift+Tab cycle within the modal.
3. When the modal closes, return focus to the element that triggered the modal.

### Implementation pattern

```javascript
function trapFocus(modal) {
  const focusable = modal.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  modal.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  first.focus();
}
```

### Dynamic content

- When new content appears (e.g., claim detail pane loads), move focus to the new content area or announce it via `aria-live`.
- When content is removed (e.g., a claim is deleted from the list), move focus to the nearest remaining item.

## 4. Color Contrast

### Requirements

- Body text on dark backgrounds: minimum 4.5:1 contrast ratio (WCAG AA).
- Large text (18px+ or 14px+ bold): minimum 3:1 contrast ratio.
- Interactive elements (links, buttons): minimum 3:1 contrast ratio against adjacent colors.

### Current design system token audit

The grainulation dark design system uses these tokens. Verify each meets the 4.5:1 minimum against the background:

| Token              | Typical value | Background | Contrast ratio | Passes? |
| ------------------ | ------------- | ---------- | -------------- | ------- |
| `--text-primary`   | `#e2e8f0`     | `#0a0e1a`  | 14.53:1        | Yes     |
| `--text-secondary` | `#94a3b8`     | `#0a0e1a`  | 6.98:1         | Yes     |
| `--text-muted`     | `#64748b`     | `#0a0e1a`  | 3.76:1         | No\*    |
| `--accent-wheat`   | `#fbbf24`     | `#0a0e1a`  | 10.74:1        | Yes     |
| `--accent-barn`    | `#e11d48`     | `#0a0e1a`  | 3.97:1         | No\*\*  |

\*`--text-muted` at 3.76:1 fails AA for normal text. Options: lighten to meet 4.5:1 or restrict use to large text / decorative elements only.

\*\*`--accent-barn` at 3.97:1 fails AA for normal text. Use only for large text, icons, or decorative elements — or pair with a lighter text label for body copy.

### Rules

- Never use color alone to convey information (add icons, patterns, or text labels).
- Status indicators (active, resolved, conflicting) must have both color and icon/text.
- Test with a contrast checker (e.g., WebAIM) when adding new color tokens.

## 5. Screen Reader Support

### Interactive elements

Every interactive element must have accessible text:

```html
<!-- Button with visible text: OK as-is -->
<button>Compile</button>

<!-- Icon-only button: needs aria-label -->
<button aria-label="Close dialog">✕</button>

<!-- Custom interactive element: needs role + aria-label -->
<div role="button" tabindex="0" aria-label="Expand claim r042">▶</div>
```

### Live regions

Use `aria-live` for dynamic content updates:

```html
<!-- Status bar: polite (announced at next pause) -->
<div aria-live="polite" aria-atomic="true" id="status">
  Compilation complete: 94 claims, 0 conflicts
</div>

<!-- Error messages: assertive (announced immediately) -->
<div aria-live="assertive" role="alert" id="errors"></div>
```

### Data tables

Claim lists rendered as tables must include proper headers:

```html
<table>
  <caption>
    Sprint claims
  </caption>
  <thead>
    <tr>
      <th scope="col">ID</th>
      <th scope="col">Type</th>
      <th scope="col">Content</th>
      <th scope="col">Evidence</th>
    </tr>
  </thead>
  <tbody>
    ...
  </tbody>
</table>
```

## 6. Reduced Motion

### Respect prefers-reduced-motion

All animations and transitions must be disabled when the user prefers reduced motion:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### Rules

- This media query must be present in every tool's stylesheet.
- Scroll-snap transitions are exempt only if they are instantaneous (no easing).
- Loading spinners may use a static indicator instead (e.g., pulsing dot becomes a static dot).
- Never auto-play video or audio.

## Compliance Checklist

Before shipping a tool UI, verify:

- [ ] All landmark regions defined (`main`, `nav`, `aside`, `header`)
- [ ] Tab key navigates all interactive elements in visual order
- [ ] Enter/Space activates focused elements
- [ ] Escape dismisses overlays and modals
- [ ] Modals trap focus and restore focus on close
- [ ] All text meets 4.5:1 contrast ratio on background
- [ ] Icon-only buttons have `aria-label`
- [ ] Dynamic content uses `aria-live`
- [ ] `prefers-reduced-motion` media query is present
- [ ] Skip-to-content link is present (if navigation is long)

## Changelog

| Date       | Change                             |
| ---------- | ---------------------------------- |
| 2026-03-15 | Initial spec (addresses r042/r059) |
