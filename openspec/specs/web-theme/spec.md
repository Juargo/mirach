# Web Theme Specification

## Purpose

Defines the `apps/web` light/dark/system theme preference: a tri-state
choice, OS-driven default, no-flash pre-paint application, localStorage-only
persistence, two toggle surfaces, and per-theme WCAG 2.2 AA contrast. Theme
is presentation, not domain data (ADR-024); `apps/api` and `resumen-view-model`
stay untouched.

## Requirements

### Requirement: WT-01 — Tri-state theme preference

The system MUST support exactly three preference states — `light`, `dark`,
`system` — independently selectable from either toggle surface (WT-06).

#### Scenario: User selects an explicit theme

- GIVEN the app is in any state
- WHEN the user selects `light` or `dark`
- THEN the app applies that theme immediately and stops following the OS

#### Scenario: User selects system

- GIVEN an explicit theme is active
- WHEN the user selects `system`
- THEN the app applies the current OS scheme and resumes following it

### Requirement: WT-02 — System default and live OS follow

On first visit (no stored preference), the system MUST default to `system`
and apply `prefers-color-scheme`. While `system` is selected, a live OS
scheme change MUST update the applied theme immediately. While an explicit
theme is selected, an OS scheme change MUST NOT change the applied theme.

#### Scenario: First visit follows the OS

- GIVEN no stored preference exists
- WHEN the app loads
- THEN the applied theme matches `prefers-color-scheme` at that moment

#### Scenario: Live OS change updates system mode

- GIVEN preference is `system` and the OS is in light mode
- WHEN the OS switches to dark
- THEN the app switches to dark without reload

#### Scenario: OS change is ignored under an explicit choice

- GIVEN preference is explicitly `dark`
- WHEN the OS switches to light
- THEN the app stays in `dark`

### Requirement: WT-03 — localStorage-only persistence, resilient to failure

The chosen preference MUST persist in `localStorage` only (no API/User
change). A `localStorage` read or write that throws (e.g. private browsing)
MUST NOT crash the app; the app MUST behave as if no preference were stored.
An unrecognized stored value MUST be treated as absent.

#### Scenario: Preference survives a reload

- GIVEN the user selected `dark`
- WHEN the page reloads
- THEN the applied theme is `dark`

#### Scenario: Storage throws on read or write

- GIVEN `localStorage` access throws in the current browsing context
- WHEN the app loads or the user changes theme
- THEN the app renders normally, defaults to `system`, and raises no
  uncaught error

#### Scenario: Invalid stored value falls back to system

- GIVEN the stored value is not one of `light`/`dark`/`system`
- WHEN the app loads
- THEN it behaves as if `system` were selected

### Requirement: WT-04 — Pre-paint application, no flash

The resolved theme class, `color-scheme`, and `theme-color` meta MUST be
applied by a synchronous script in `index.html` before first paint and
before the React app mounts, reading `localStorage` then falling back to
`matchMedia('(prefers-color-scheme: dark)')`.

#### Scenario: No flash of the wrong theme on reload

- GIVEN the stored preference is `dark`
- WHEN the page reloads
- THEN the DOM carries the dark theme class and `color-scheme` before React
  mounts — no intermediate light paint is observable

### Requirement: WT-05 — Cross-tab consistency

A theme change made in one tab MUST be reflected in other open tabs of the
same origin without a manual reload.

#### Scenario: Second tab picks up the change

- GIVEN two tabs of the app are open, both on `light`
- WHEN tab A switches to `dark`
- THEN tab B updates to `dark` without reload

### Requirement: WT-06 — Two accessible toggle surfaces, kept in sync

The system MUST expose the toggle in a new `Apariencia` section of
Configuración → Perfil, and a compact shortcut in the Sidebar footer
(desktop). Both MUST be keyboard-operable and expose an accessible name and
current-state to assistive tech (ADR-018). Both MUST reflect the same
underlying preference.

#### Scenario: Perfil control is keyboard-operable

- GIVEN focus is on the Apariencia control in Perfil
- WHEN the user operates it via keyboard only
- THEN the preference changes and the control announces its new state

#### Scenario: Sidebar shortcut is keyboard-operable

- GIVEN focus is on the Sidebar footer theme shortcut
- WHEN the user operates it via keyboard only
- THEN the preference changes and the control announces its new state

#### Scenario: The two surfaces stay in sync

- GIVEN the user changes theme via the Sidebar shortcut
- WHEN the Perfil Apariencia control is inspected
- THEN it reflects the same, newly-selected state

### Requirement: WT-07 — WCAG 2.2 AA contrast in each theme

Each theme (light and dark) MUST independently meet WCAG 2.2 AA: text
pairings ≥4.5:1, non-text UI pairings ≥3:1. This covers general
text/background pairings, bucket fills against their surrounding surface,
on-wedge pie label text, wedge separators, and the donut focus indicator.

#### Scenario: Text and non-text pairings meet AA per theme

- GIVEN the full set of themed color pairings for light and for dark
- WHEN contrast ratios are computed against each theme's own surfaces
- THEN every text pairing is ≥4.5:1 and every non-text pairing is ≥3:1 in
  both themes

#### Scenario: Pie label and focus indicator remain legible per theme

- GIVEN a pie wedge with an on-wedge label and the donut's focus indicator
- WHEN rendered in light and then in dark
- THEN the label text and the focus indicator each meet their applicable AA
  threshold in both themes

### Requirement: WT-08 — Bucket identity preserved across themes

The bucket-to-hue mapping (Necesidades/Gustos/Ahorro/exceso) MUST remain
recognizable in both themes, with Ahorro remaining the most visually salient
bucket in each.

#### Scenario: Same bucket is recognizable across themes

- GIVEN a bucket's fill in light and its fill in dark
- WHEN compared
- THEN both belong to the same identity hue family (Brote palette)

#### Scenario: Ahorro stays most salient in both themes

- GIVEN all bucket fills rendered together in a given theme
- WHEN their relative salience (contrast/chroma) is compared
- THEN Ahorro is the most salient bucket in both light and dark

### Requirement: WT-09 — View-model stays free of color concerns

`resumen-view-model` MUST NOT import or reference color tokens, theme state,
or the theme hook. Color resolution happens only at the presentation layer
(ADR-024).

#### Scenario: No color import in the view-model

- GIVEN the `resumen-view-model` source files
- WHEN their imports are inspected
- THEN none reference a color token, `bucket-colors`, `pie-colors`, or the
  theme hook
