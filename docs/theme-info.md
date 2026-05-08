# Theme system notes

This note describes the theme system itself: how theme tokens are defined, applied, persisted, and consumed by the UI. ARTCTL now mirrors the Cortex theme catalog and token definitions in `src/themes.js`.

## High-level model

The theme system is built around **semantic CSS custom properties**. React stores the selected theme ID, writes the corresponding variable set onto `document.documentElement`, and the UI updates automatically because Tailwind colors resolve through those variables.

## Key files

| File | Role |
| --- | --- |
| `cortex/src/index.css` | Defines the default token set in `:root` and applies `bg-background` / `text-foreground` to the page. |
| `cortex/tailwind.config.js` | Maps Tailwind color names like `background`, `primary`, `card`, `border`, and `sidebar.*` to CSS variables. |
| `cortex/src/lib/themes.js` | Theme catalog plus `applyTheme(theme)`, which writes variables to the root element. |
| `cortex/src/lib/ThemeContext.jsx` | Holds `themeId`, persists it to `localStorage`, and reapplies the active theme on change. |
| `cortex/src/pages/Theme.jsx` | Theme picker UI. |
| `cortex/src/App.jsx` | Wraps the whole app in `ThemeProvider`. |
| `cortex/src/lib/themes.test.js` | Verifies theme definitions and variable application. |

## Runtime flow

1. `ThemeProvider` initializes `themeId` from `localStorage` key `adhd-tasks-theme`, or falls back to `DEFAULT_THEME_ID` (`dark-green`).
2. A `useEffect` watches `themeId`.
3. On change, it finds the matching entry in `THEMES` and calls `applyTheme(theme)`.
4. `applyTheme()` iterates `theme.vars` and calls `document.documentElement.style.setProperty(...)` for each token.
5. `applyTheme()` also mirrors some values into sidebar-specific tokens like `--sidebar-background`, `--sidebar-primary`, and `--sidebar-border`.
6. Because the UI uses Tailwind classes like `bg-background`, `text-foreground`, `border-border`, and `bg-card`, the new variable values propagate across the app immediately.

## Theme shape

Each theme entry in `cortex/src/lib/themes.js` looks like this:

```js
{
  id: 'dark-green',
  label: 'Dark Green',
  preview: { bg: '#0a0d0f', primary: '#3db870' },
  vars: {
    '--background': '220 20% 4%',
    '--foreground': '60 10% 85%',
    '--primary': '145 60% 45%',
    '--border': '220 15% 18%',
    // ...
  },
}
```

Important details:

- Variable values are stored as **HSL triplets**, not full `hsl(...)` strings.
- Tailwind wraps them with `hsl(var(--token))`.
- Themes are semantic, not component-specific: the app styles against roles like `background`, `card`, `muted`, `accent`, and `ring`.
- There is also a custom token `--task-doing` for task state styling.

## Current theme catalog

These are the theme IDs and labels currently mirrored into ARTCTL from Cortex:

| ID | Label | Preview background | Preview primary |
| --- | --- | --- | --- |
| `dark-green` | Dark Green | `#0a0d0f` | `#3db870` |
| `light` | Light | `#f8f9fa` | `#1a7f4b` |
| `dark-blue` | Dark Blue | `#060d1a` | `#4a9eff` |
| `dark-purple` | Dark Purple | `#0d0a18` | `#a855f7` |
| `dark-red` | Dark Red | `#110808` | `#ef4444` |
| `dark-orange` | Dark Orange | `#110c05` | `#f97316` |
| `dark-cyan` | Dark Cyan | `#050f11` | `#06b6d4` |
| `dark-pink` | Dark Pink | `#110810` | `#ec4899` |
| `windows-95` | Windows 95 | `#c0c0c0` | `#000080` |
| `windows-xp` | Windows XP | `#eaf6ff` | `#0058e6` |
| `crt-amber` | CRT Amber | `#120a00` | `#ffb000` |
| `solarized` | Solarized | `#002b36` | `#859900` |
| `light-sepia` | Sepia | `#f5f0e8` | `#8b5e3c` |

The default theme is `dark-green`.

## Why this works cleanly

This approach separates responsibilities well:

- **CSS variables** define the live design tokens.
- **Tailwind** turns those tokens into reusable utility classes.
- **React context** manages selection and persistence.
- **The theme page** is just a thin selector over the shared theme catalog.

That means adding a new theme usually requires only:

1. adding one object to `THEMES`
2. supplying the full `vars` map
3. optionally adding `preview` colors for the picker

No component-level styling changes are needed as long as components keep using semantic Tailwind tokens instead of hard-coded colors.

## Notable implementation choices

- The app does **not** toggle a `dark` or `light` class to switch themes in practice; it directly mutates root variables.
- `src/index.css` provides a default token baseline so the app renders correctly before React applies a stored selection.
- The sidebar tokens are derived during `applyTheme()` instead of repeated manually inside every theme definition.
- Tests focus on catalog completeness and confirm that `applyTheme()` writes expected CSS variables.
