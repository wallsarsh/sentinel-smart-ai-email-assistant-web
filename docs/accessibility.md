# Accessibility audit

Run: `npm run build && npm run e2e` (the audit is `tests/a11y/audit.e2e.ts`, part of the CI `e2e` job).

## What is checked automatically

- **axe-core** (WCAG 2.0/2.1/2.2 A and AA rules plus best practices) on every page in the real built app, in a real
  Chromium, in **light and dark** schemes: 4 signed-out and 23 signed-in routes. Serious and critical findings fail the
  run; anything lesser is printed. Colour contrast is included because it runs in a real browser.
- **Keyboard**: sign-in form reading order and no focus trap; skip link first and it moves focus to the main region;
  every focusable control on six key pages has a visible focus indicator.
- **Reduced motion**: with `prefers-reduced-motion: reduce`, no element animates or transitions for more than an instant.
- **Reflow**: every real page fits a 320 px viewport (the layout of a desktop window at 400% zoom) without sideways scrolling.
  Component-level 200% zoom and phone/tablet/desktop screenshots are in `tests/visual`.
- Component tests (`tests/components`) run axe on each interactive component, and check dialog focus and Escape.

## Findings and fixes

| Finding | Where | Fix |
| --- | --- | --- |
| Colour contrast failed in dark mode: form fields kept the browser's light background under light text | every page with an input or select (catch-up, profile, usage, senders, sending, background, privacy) | form controls take the theme tokens; `color-scheme: light dark`; borders follow `--border` (`main.css`) |
| No level-one heading when the consent page has no provider | `/settings/ai/consent` | heading in the empty state |
| Navigation never rendered (component name mismatch) | all pages | found by the visual harness (T144) |
| Tap targets under 24 px (Correct this, remove recipient) | triage card, recipient list | minimum height/width (T144) |

## Screen reader notes (design, not a substitute for testing with one)

- Landmarks: skip link, `nav` (named "Main navigation"), `main` (focusable target of the skip link), page `h1`, sections
  labelled by their headings.
- State changes are announced: failure banners use `role=alert` (errors) or `role=status`; save/progress messages,
  the offline banner, the undo countdown and the stale-brief notice use `role=status`.
- Priority and state are always written out; colour is only a hint (priority chips carry a text label and icon).
- Dialogs (send confirmation, link guard) are modal with focus placed on the safe button (Cancel) and Escape closing.
- The submit button on the sign-in form is disabled until both fields are filled, so keyboard users skip it until then.

## Not verified

No real screen reader (NVDA, JAWS, VoiceOver, TalkBack) was run, and no real device or high-contrast mode. Those belong
to the manual acceptance pass (T160).
