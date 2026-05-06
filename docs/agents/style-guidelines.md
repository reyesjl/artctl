# Terminal UI Kit & Style Guide

A general-purpose style guide for building focused, terminal-inspired web apps. This guide is product-agnostic and can be used by any coding agent or developer to recreate the same visual language for task managers, dashboards, admin tools, documentation portals, viewers, or command-driven applications.

---

## 1. Design Intent

This interface should feel like a modern terminal turned into a clean web application.

Core qualities:

- focused
- minimal
- keyboard-friendly
- low-distraction
- information-dense without visual clutter
- monochrome-first with one strong accent color
- sharp, rectangular, grid-based
- text-led rather than icon-led
- calm, technical, and utilitarian

The design should avoid soft consumer-app styling. No rounded cards, no gradients, no drop shadows, no glassmorphism, no large illustrations, no playful animations.

The UI should feel like a command console, man page, system dashboard, or TUI translated into the browser.

---

## 2. Visual Principles

### 2.1 Terminal First

Use text, brackets, borders, and spacing as the primary interface language.

Preferred patterns:

```text
[section]
[active]
[settings]
> command input
— section title —
[ ] todo item
[x] completed item
```

Avoid decorative icons unless they communicate state very clearly.

### 2.2 One Accent Color

Each theme should have one dominant accent color. The accent is used for:

- active navigation
- links
- selected states
- progress bars
- key labels
- important metadata
- command prompts

Everything else should stay muted.

### 2.3 Dense But Quiet

The layout can show a lot of information, but the colors should remain restrained. Do not use large colorful cards. Use subtle borders and muted labels.

### 2.4 Rectangular System UI

All surfaces should be rectangular with little or no border radius.

Recommended radius:

```css
border-radius: 0px;
```

A tiny radius of `2px` is acceptable only if the host app needs softer rendering.

---

## 3. Layout System

### 3.1 Page Shell

The app uses a fixed top navigation bar, a centered content area, and a fixed or anchored footer/status line.

Recommended structure:

```text
┌──────────────────────────────────────────────────────────────┐
│ BRAND   [nav] [nav] [nav]                         tagline   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                 centered content column                      │
│                                                              │
│                 panels, forms, lists, docs                   │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                         version/status                       │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Content Width

Use a narrow-to-medium centered working area. The UI should not stretch content edge-to-edge.

Recommended widths:

```css
--content-width: 860px;
--content-wide: 1040px;
--content-docs: 920px;
```

For documentation pages, allow a two-column layout with a left section index and main document body.

### 3.3 Spacing Scale

Use a compact spacing scale.

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 24px;
--space-6: 32px;
--space-7: 48px;
```

Default vertical rhythm:

- page top padding: `16px` to `24px`
- panel padding: `12px` to `16px`
- row height: `42px` to `48px`
- nav height: `36px` to `40px`

### 3.4 Grid

Use simple grids:

- one-column forms and lists
- two-column theme/settings grids
- four-column metric grids
- docs pages with sidebar + content

Avoid masonry, floating elements, and asymmetrical marketing layouts.

---

## 4. Typography

### 4.1 Font Family

Use a monospace font for the entire app.

Recommended stack:

```css
font-family:
  "IBM Plex Mono",
  "JetBrains Mono",
  "SFMono-Regular",
  Consolas,
  "Liberation Mono",
  monospace;
```

### 4.2 Font Sizes

Keep type compact and consistent.

```css
--font-xs: 11px;
--font-sm: 12px;
--font-md: 14px;
--font-lg: 16px;
--font-xl: 18px;
```

Recommended usage:

- tiny metadata: `11px`
- labels/nav/help text: `12px`
- normal UI text: `14px`
- page titles: `16px` to `18px`

### 4.3 Font Weight

Use weight sparingly.

```css
--weight-normal: 400;
--weight-medium: 500;
--weight-bold: 700;
```

Only make these bold:

- brand
- active values
- task titles / row titles
- section names
- important numbers

---

## 5. Color System

### 5.1 Dark Base Theme

The default look is dark blue-black with cool muted text and electric accent blue.

```css
:root {
  --bg: #070b12;
  --surface: #0d1320;
  --surface-2: #101827;
  --surface-3: #131d2e;

  --border: #26344d;
  --border-strong: #3a5278;

  --text: #e6f1ff;
  --text-muted: #7f94bd;
  --text-dim: #42506a;

  --accent: #2f9bff;
  --accent-strong: #51adff;
  --accent-bg: #08284a;

  --danger: #ff4545;
  --warning: #ffb020;
  --success: #31c48d;
  --info: #19c8ff;
}
```

### 5.2 Color Roles

Use color by semantic role, not by component.

- `--bg`: full page background
- `--surface`: panels, inputs, rows
- `--surface-2`: elevated/active panels
- `--border`: default outlines
- `--border-strong`: selected or focused outlines
- `--text`: primary text
- `--text-muted`: labels and helper text
- `--text-dim`: disabled or completed content
- `--accent`: active state, prompt, links, selected nav
- `--danger`: overdue, destructive, critical priority
- `--warning`: medium priority, caution
- `--success`: completed/positive state

### 5.3 Theme Variants

A theme should only swap the accent and a few semantic colors. Do not redesign the layout per theme.

Suggested themes:

```text
Dark Blue     accent #2f9bff
Dark Green    accent #35c46f
Dark Purple   accent #9b5cff
Dark Red      accent #ff4545
Dark Orange   accent #ff8a1f
Dark Cyan     accent #19c8ff
CRT Amber     accent #ffb020
Solarized     accent #a3be00
Light         bg #f5f7fb, text #111827, accent #1f8f55
Windows 95    gray surfaces, blue accent, hard borders
Windows XP    pale surfaces, vivid blue accent
Sepia         warm bg, brown accent
```

---

## 6. Navigation

### 6.1 Top Bar

Use a thin fixed-height top bar.

```text
BRAND   [section]   [section]   [section]                  muted tagline
```

Rules:

- brand is accent colored and bold
- nav items are bracketed text
- active nav item has accent background or accent border
- tagline/status text sits far right in muted/dim color
- no icons required

Example:

```text
APPNAME   [dashboard]   [activity]   [help]   [theme]        focused. minimal. no distractions.
```

### 6.2 Nav Item States

```css
.nav-item {
  color: var(--text-muted);
  padding: 2px 8px;
}

.nav-item::before { content: "["; }
.nav-item::after { content: "]"; }

.nav-item.active {
  color: var(--text);
  background: var(--accent-bg);
  border: 1px solid var(--accent);
}
```

---

## 7. Panels

Panels are bordered rectangular blocks.

```css
.panel {
  background: var(--surface);
  border: 1px solid var(--border);
  padding: 14px 16px;
}
```

Panel titles should look terminal-like:

```text
— section title —
```

Use accent for the title, muted text for helper copy.

Panel types:

- account/status strip
- input panel
- suggestion panel
- list panel
- metric panel
- documentation/code panel
- theme option panel

Avoid shadows.

---

## 8. Forms & Inputs

### 8.1 Command Input

Inputs should resemble terminal command lines.

```text
> add item
```

The prompt marker `>` should be accent or muted blue. The input background should match a panel or slightly darker surface.

```css
.command-input {
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  font-family: inherit;
  font-size: var(--font-md);
  padding: 12px;
  outline: none;
}

.command-input:focus {
  border-color: var(--accent);
}
```

### 8.2 Placeholder Text

Placeholders should demonstrate syntax, not marketing copy.

Good:

```text
title !H due:fri #tag @person p:project
```

Bad:

```text
What would you like to accomplish today?
```

### 8.3 Helper Syntax Row

Below command inputs, include a tiny muted syntax hint row.

```text
!H/M/L   #tag   @person   due:fri / due:in 3 days   after:next mon   p:project
```

---

## 9. Lists & Rows

### 9.1 Row Structure

Rows should be bordered by thin horizontal dividers.

```text
[ ] !M Item title p:project due:date                         score
[x] Completed item #tag @person                              score
```

Recommended row height:

```css
.task-row {
  min-height: 44px;
  display: grid;
  grid-template-columns: 32px 1fr auto;
  align-items: center;
  border-bottom: 1px solid rgba(38, 52, 77, 0.45);
}
```

### 9.2 Completed Rows

Completed rows are dimmed and struck through.

```css
.row.done {
  color: var(--text-dim);
  text-decoration: line-through;
}
```

Status markers:

```text
[ ] todo
[~] doing
[x] done
[?] suggested / unresolved
```

---

## 10. Metadata Tokens

Use compact inline tokens instead of badges or pills.

Examples:

```text
p:work
#bug
@alice
due:2026-05-06
after:next week
!H
```

Token colors:

```css
.token-project { color: var(--accent); }
.token-tag { color: var(--success); }
.token-person { color: var(--warning); }
.token-due { color: var(--danger); }
.token-after { color: var(--text-muted); }
.token-priority { color: var(--info); font-weight: 700; }
```

Do not wrap tokens in rounded pills. The token itself is the visual unit.

---

## 11. Metrics & Dashboards

Dashboards should look like terminal reports.

Use:

- section panels
- ASCII-style titles
- small metric cards
- text-based bars
- compact labels

### 11.1 Progress Bar

Use block characters or a rectangular filled bar.

```text
progress
████████░░░░░░░░ 56%
5/9 complete
```

Recommended characters:

```text
█ ▓ ▒ ░
```

### 11.2 Metric Cards

```text
┌──────────────┐
│ todo         │
│ 4            │
└──────────────┘
```

CSS:

```css
.metric-card {
  border: 1px solid var(--border);
  background: transparent;
  padding: 12px;
}

.metric-label {
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.metric-value {
  color: var(--text);
  font-size: var(--font-lg);
  font-weight: 700;
}
```

---

## 12. Documentation / Help Pages

Help pages should resemble a Unix manual page.

Layout:

```text
[left section index]   [manual content]
```

Manual content should use:

- uppercase title
- subtitle/description
- section headings with em dashes
- command examples in bordered blocks
- two-column definition rows

Example:

```text
APPNAME(1)
Terminal Interface — User Manual

— NAME —
APPNAME — short description of the system.

— SYNOPSIS —
> command [option] [metadata:value]
```

Sidebar section links should be bracketed:

```text
[name]
[examples]
[settings]
[shortcuts]
```

---

## 13. Theme Selector

Theme selection should be a simple two-column grid of rectangular options.

Each option includes:

- tiny background swatch
- tiny accent swatch
- theme name
- checkmark or marker if selected

```text
[■ ■] Dark Blue                                      ✓
```

CSS:

```css
.theme-option {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  padding: 10px 12px;
}

.theme-option.selected {
  border-color: var(--accent);
  background: var(--accent-bg);
}
```

---

## 14. Buttons & Actions

Buttons should look like command affordances, not rounded CTAs.

Preferred forms:

```text
[save]
[cancel]
[settings]
[ai assist]
```

CSS:

```css
.button {
  font-family: inherit;
  font-size: var(--font-sm);
  background: transparent;
  color: var(--text-muted);
  border: 1px solid var(--border);
  padding: 6px 10px;
}

.button:hover,
.button:focus {
  color: var(--text);
  border-color: var(--accent);
  background: var(--accent-bg);
}
```

Primary buttons should still stay restrained.

---

## 15. Interaction States

### Hover

Subtle border brightening or accent-tinted background.

### Focus

Always visible. Use accent outline or border.

```css
:focus-visible {
  outline: 1px solid var(--accent);
  outline-offset: 1px;
}
```

### Selected

Use accent border + tinted background.

### Disabled

Dim text and reduce contrast. Do not hide completely.

### Loading

Prefer terminal-style text shimmer or character animation over spinners.

Examples:

```text
⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏
░▒▓▒░ generating
```

---

## 16. Animation

Use almost no animation.

Allowed:

- cursor blink
- subtle loading shimmer
- instant hover/focus changes
- tiny opacity transition under `120ms`

Avoid:

- page transitions
- bouncing
- spring motion
- parallax
- large fades

```css
* {
  transition:
    color 80ms linear,
    border-color 80ms linear,
    background-color 80ms linear;
}
```

Respect reduced motion.

---

## 17. Accessibility

Minimum requirements:

- keyboard navigable
- visible focus states
- semantic buttons and inputs
- sufficient contrast
- do not rely only on color for status
- preserve text labels next to symbols
- support reduced motion

Use real text wherever possible. Avoid rendering important content purely as canvas/SVG.

---

## 18. Component Inventory

A coding agent should implement these reusable components:

```text
AppShell
TopNav
FooterStatus
PageContainer
Panel
SectionTitle
CommandInput
SyntaxHint
ActionButton
TokenText
StatusMarker
TaskRow / ListRow
SuggestionPanel
MetricCard
ProgressBar
TextBarChart
DocsLayout
DocsSidebar
ManualSection
CodeExampleBox
ThemeGrid
ThemeOption
```

---

## 19. CSS Starter Tokens

```css
:root {
  color-scheme: dark;

  --bg: #070b12;
  --surface: #0d1320;
  --surface-2: #101827;
  --surface-3: #131d2e;

  --border: #26344d;
  --border-strong: #3a5278;

  --text: #e6f1ff;
  --text-muted: #7f94bd;
  --text-dim: #42506a;

  --accent: #2f9bff;
  --accent-strong: #51adff;
  --accent-bg: #08284a;

  --danger: #ff4545;
  --warning: #ffb020;
  --success: #31c48d;
  --info: #19c8ff;

  --font-mono: "IBM Plex Mono", "JetBrains Mono", "SFMono-Regular", Consolas, monospace;

  --font-xs: 11px;
  --font-sm: 12px;
  --font-md: 14px;
  --font-lg: 16px;
  --font-xl: 18px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;

  --content-width: 860px;
  --content-wide: 1040px;
}

html,
body {
  margin: 0;
  min-height: 100%;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: var(--font-md);
}

body {
  line-height: 1.45;
}

button,
input,
textarea,
select {
  font: inherit;
}

::selection {
  background: var(--accent-bg);
  color: var(--text);
}
```

---

## 20. Implementation Rules for Coding Agents

When recreating this style for any app, follow these rules:

1. Use a full dark terminal shell with a thin top nav and centered content column.
2. Use a monospace font across the entire interface.
3. Use square bordered panels instead of rounded cards.
4. Use bracketed labels for navigation and actions.
5. Use one accent color per theme.
6. Keep text muted by default; reserve bright text for active values and primary content.
7. Represent metadata inline as compact tokens, not pills.
8. Use text/ASCII-inspired progress and charts where possible.
9. Keep animations minimal and functional.
10. Avoid icons unless they replace standard terminal symbols poorly.
11. Do not introduce gradients, glass effects, large shadows, or soft SaaS styling.
12. Build reusable components from the component inventory above.
13. Keep the UI dense, quiet, and deterministic.
14. Make every action keyboard-accessible.
15. Treat the interface like a professional tool, not a marketing website.

---

## 21. Generic Page Templates

### 21.1 Command List Page

```text
APPNAME   [items] [stats] [help] [theme]                    focused. minimal. no distractions.

                 [account/status strip]

                 > add item
                 placeholder syntax / helper row

                 suggestion or system feedback panel

                 count [filter]
                 ┌────────────────────────────────────────────┐
                 │ [ ] Item title p:project due:date      84  │
                 │ [ ] Item title #tag @person            32  │
                 │ [x] Completed item                     0   │
                 └────────────────────────────────────────────┘

APPNAME v1.0
```

### 21.2 Metrics Page

```text
APPNAME   [items] [stats] [help] [theme]

                 total items tracked

                 ┌─ momentum ────────────────────────────────┐
                 │ progress                         56%       │
                 │ ████████░░░░░░░░                           │
                 │ 5/9 complete                               │
                 │                                            │
                 │ todo 4 | doing 0 | done 5 | overdue 0      │
                 └────────────────────────────────────────────┘

                 ┌─ velocity ────────────────────────────────┐
                 │ Mon █████ 3                               │
                 │ Tue ░░░░░ 0                               │
                 └────────────────────────────────────────────┘
```

### 21.3 Manual / Help Page

```text
APPNAME   [items] [stats] [help] [theme]

     [sections]          APPNAME(1)
     [name]              Terminal Interface — User Manual
     [synopsis]
     [examples]          — NAME —
     [settings]          APPNAME — short description.

                         — SYNOPSIS —
                         > command [metadata:value] [#tag]
```

### 21.4 Theme Page

```text
APPNAME   [items] [stats] [help] [theme]

                 — theme —
                 Choose a color theme. Your selection is saved locally.

                 [■ ■] Dark Green        [■ ■] Light
                 [■ ■] Dark Blue     ✓   [■ ■] Dark Purple
                 [■ ■] Dark Red          [■ ■] Dark Orange
```

---

## 22. Quality Bar

The UI is successful when it feels like:

- a terminal
- a manual page
- a focused productivity tool
- a system monitor
- a developer console

The UI is unsuccessful when it feels like:

- a generic SaaS dashboard
- a rounded card template
- a marketing landing page
- a mobile-first social app
- a colorful analytics product