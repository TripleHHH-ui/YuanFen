---
kind: frontend_style
name: 'YuanFen CSS-in-JS-Free Design System: Paper & Ink Theme with CSS Custom Properties'
category: frontend_style
scope:
    - '**'
source_files:
    - apps/web/src/styles.css
    - apps/web/package.json
    - apps/web/vite.config.ts
    - apps/web/index.html
    - apps/web/src/main.tsx
---

## What system/approach is used

The `apps/web` frontend uses a **vanilla CSS design system** built entirely on CSS custom properties (CSS variables), scoped in a single global stylesheet (`apps/web/src/styles.css`). There is no CSS framework (no Tailwind, Bootstrap, etc.), no CSS-in-JS library, and no component-style packages — styling lives purely in one file and is consumed by React components via class names. The build toolchain is Vite + the React plugin; styles are imported once from `main.tsx`.

The visual identity is a handcrafted theme called **"YuanFen"** (缘分 — "the red thread of fate"), described in the stylesheet header as *rice-paper ground · ink text · one vermilion thread that is the route · gold wax seals for what fate hasn't shown you yet*. It defines a cohesive East-Asian-inspired aesthetic using:
- A warm paper palette (`--paper`, `--paper-2`, `--card`) as backgrounds
- Dark ink tones (`--ink`, `--ink-soft`) for body copy
- A cinnabar red accent (`--thread`, `--thread-deep`) representing the fateful thread
- Jade green (`--jade`) for positive/booking actions
- Gold (`--gold`, `--gold-deep`) for sealed/wildcard elements
- Three typefaces loaded from Google Fonts: Fraunces (display serif), Schibsted Grotesk (body sans), Spline Sans Mono (code/metadata)

## Key files and packages

- `apps/web/src/styles.css` — the entire design system: tokens, typography, layout shells, animations, responsive breakpoints, and every UI surface (onboarding, taste deck, map overlay, route panel, narration strip, booking sheet, evidence panel, toasts).
- `apps/web/package.json` — declares only React, Zustand, MapLibre GL, and Vite; zero styling dependencies beyond vanilla CSS.
- `apps/web/vite.config.ts` — Vite config with the React plugin; no PostCSS, Sass, or CSS preprocessing configured.
- `apps/web/index.html` — root HTML shell.
- `apps/web/src/main.tsx` — entry point that imports `styles.css`.

## Architecture and conventions

### Design tokens via `:root` custom properties
All colors, fonts, shadows, and spacing tokens live in `:root` at the top of `styles.css`. Components never hard-code hex values — they reference `var(--paper)`, `var(--thread)`, `var(--shadow)`, etc. This makes the theme globally swappable through a single variable block.

### Class-name methodology
Components use BEM-like descriptive class names (e.g., `.deck-stage`, `.swipe-card`, `.route-panel`, `.chat-bar`, `.deal-card`, `.booking-sheet`, `.evidence-panel`, `.alert-slip`). There is no CSS Modules, no CSS-in-JS, and no scoped styling — all classes are globally available. Naming follows a flat, semantic convention rather than a strict BEM prefix scheme.

### Layout model
- A full-height `.app-shell` wraps the app, with an optional `.paper` variant that adds radial gradients and a noise SVG texture overlay.
- Panels (`.route-panel`, `.trip-panel`) are absolutely positioned over a MapLibre canvas (`.map-canvas`).
- Floating overlays (`.overlay`, `.hand-sheet`, `.booking-sheet`, `.evidence-panel`, `.alert-slip`) use absolute positioning with z-index layering.
- A bottom-centered `.narration` strip and right-side `.evidence-toggle` provide persistent secondary surfaces.

### Typography scale
- Display headings use Fraunces with tight letter-spacing and large clamp-based sizing.
- Body copy uses Schibsted Grotesk at 15px base with 1.45 line-height.
- Monospace metadata (flight numbers, times, tags) uses Spline Sans Mono.
- Small labels use uppercase tracking (`letter-spacing: 0.13em`) for section headers like `.block-label` and `.ev-head`.

### Motion and micro-interactions
Animations are defined as keyframes (`rise`, `slip-up`, `slip-in`, `fade`, `reveal-pop`, `pulse`, `fall`) and applied via utility classes (`.reveal-1/2/3`, `.live`, `.dragging`, `.ghost`, `.sealed`). Transitions are consistently eased with `cubic-bezier(0.2, 0.8, 0.2, 1)` for spring-like motion. Hover states lift cards with `translateY(-2px)` and swap borders/backgrounds.

### Responsive strategy
A single `@media (max-width: 760px)` breakpoint collapses side panels into full-width floating sheets, narrows margins, and resizes the narration/evidence controls. No mobile-first media queries or fluid grid systems — it's desktop-first with a narrow-screen override.

### Component-specific patterns
- **Taste deck**: swipeable cards with drag physics, stamp overlays (`.stamp-like`, `.stamp-pass`, `.stamp-must`), and a progress meter with animated `.meter-fill` and `.knot`.
- **Route panel**: timeline-style stop list with a dashed vertical connector drawn via `::before` pseudo-element.
- **Booking sheet**: masked summary rows, environment badges (`.env-badge.fixture`, `.env-badge.sandbox`), and ticket stub visuals with perforated edges.
- **Evidence panel**: dark-mode terminal-style log viewer with mode-colored chips.

## Rules developers should follow

1. **Never hard-code colors or fonts** — always use the `--*` tokens from `:root`. If a new color is needed, add it to `:root` first.
2. **Keep all styles in `apps/web/src/styles.css`** — do not create per-component CSS files; this repo has no CSS Modules or CSS-in-JS setup.
3. **Use semantic class names** that describe the UI element (e.g., `.swipe-card`, `.deal-card`, `.stop-list`), not generic names like `.box` or `.wrapper`.
4. **Reference the established token vocabulary**: `--paper/--paper-2/--card` for backgrounds, `--ink/--ink-soft` for text, `--thread/--thread-deep` for primary actions, `--jade` for confirmations, `--gold/--gold-deep` for sealed/wildcard states.
5. **Reuse existing animation classes** (`.reveal-*`, `.live`, `.ghost`, `.sealed`) and keyframes rather than inventing new ones. Keep transitions under 0.5s with the project's signature cubic-bezier easing.
6. **Follow the desktop-first layout pattern**: position panels absolutely over the map canvas, use `.overlay` + `.hand-sheet`/`.booking-sheet` for modals, and rely on the single `@media (max-width: 760px)` breakpoint for mobile adjustments.
7. **Typography discipline**: display text → Fraunces, body → Schibsted Grotesk, metadata/code → Spline Sans Mono. Use `clamp()` for fluid heading sizes and `letter-spacing` for small uppercase labels.
8. **Accessibility basics already in place**: `button:focus-visible` gets a `--thread` outline; avoid removing focus indicators when adding new interactive elements.