# Shared WCAG checklist

Referenced by `brief/SKILL.md` and `present/SKILL.md`. When modifying WCAG
requirements that apply to every generated HTML artifact, edit this file —
the skills inline this list by reference.

## Shared items (apply to every generated HTML artifact)

- [ ] `<a href="#main-content" class="skip-nav">Skip to content</a>` as the
      first child of `<body>`
- [ ] `<main id="main-content" role="main" ...>` wraps all content
- [ ] `:focus-visible` outline styles (2px solid `#4ecdc4`, offset 2px)
- [ ] `.sr-only` utility class defined in CSS
- [ ] Severity indicators (`.sev--critical`, `.sev--high`, …) and tags
      always include text labels, never color alone
- [ ] Gradient text has an `@supports not (-webkit-background-clip: text)`
      fallback
- [ ] `<footer role="contentinfo">` at the end of the document
