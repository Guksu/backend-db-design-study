---
name: DB 설계 실험실
description: An operations console for reading DB design decisions and the experiments that prove them on a real PostgreSQL.
colors:
  console-blue: "#0a6cce"
  console-blue-hover: "#075aac"
  console-blue-soft: "#e9f2fc"
  on-accent: "#ffffff"
  header-carbon: "#161a21"
  header-ink: "#eef1f5"
  header-muted: "#9aa4b3"
  header-line: "#2b313b"
  work-plane: "#f1f2f4"
  surface: "#ffffff"
  surface-2: "#f7f8fa"
  surface-3: "#eceef2"
  line: "#e1e4e9"
  line-strong: "#c8cdd5"
  ink: "#0f1419"
  ink-2: "#3c4654"
  muted: "#646e7c"
  success: "#0ca30c"
  success-ink: "#0a6e0a"
  success-soft: "#e9f6e9"
  error: "#d03b3b"
  error-ink: "#b02a2a"
  error-soft: "#fcecec"
  warning: "#d98a00"
  warning-ink: "#8a5600"
  warning-soft: "#fdf4e3"
  info: "#2a78d6"
  info-ink: "#1d5ea8"
  info-soft: "#e9f1fc"
  series-a: "#2a78d6"
  series-b: "#eb6834"
typography:
  headline:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, Apple SD Gothic Neo, Noto Sans KR, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, Apple SD Gothic Neo, Noto Sans KR, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.3
  stat:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, Apple SD Gothic Neo, Noto Sans KR, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    fontFeature: "tnum"
  body:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, Apple SD Gothic Neo, Noto Sans KR, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  body-dense:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, Apple SD Gothic Neo, Noto Sans KR, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, Apple SD Gothic Neo, Noto Sans KR, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 600
  micro:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, Apple SD Gothic Neo, Noto Sans KR, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
  mono:
    fontFamily: "ui-monospace, SF Mono, JetBrains Mono, Menlo, Consolas, monospace"
    fontSize: "0.88em"
rounded:
  xs: "3px"
  code: "4px"
  sm: "5px"
  md: "8px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "20px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.console-blue}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "{colors.console-blue-hover}"
  button-normal:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: "32px"
  button-normal-hover:
    backgroundColor: "{colors.surface-2}"
  container:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "16px 20px"
  global-header:
    backgroundColor: "{colors.header-carbon}"
    textColor: "{colors.header-ink}"
    height: "44px"
  sidenav-item-current:
    backgroundColor: "{colors.console-blue-soft}"
    textColor: "{colors.console-blue}"
    padding: "6px 20px 6px 48px"
  table-header:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    padding: "10px 16px"
  input-number:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.sm}"
    height: "30px"
  badge:
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    height: "18px"
    padding: "0 7px"
---

# Design System: DB 설계 실험실

## Overview

**Creative North Star: "The Evidence Console"**

The lab is a cloud console in the Datadog and AWS console canon, played straight. A dark global header sits over a cool gray work plane; everything the visitor reads lives in white containers drawn with 1px lines. The protagonists are decision-record tables and experiment screens (trace waterfall, heatmap, bar comparison, EXPLAIN plan tree, live ERD), never marketing heroes or card grids.

Density is console-grade but the text load is light. Every item shows one short line by default, plus numbers and charts; anything longer sits behind a "자세히" disclosure or in a topic of the right-hand "정보" help panel. Copy is Korean, plain and short. Color is almost entirely neutral: one console blue carries interaction, a small status set carries outcomes (always with an icon and a word), and a validated two-series dataviz pair carries chart data.

Confirmed rejections: AI-looking light purple and lavender accents (banned by the owner), landing-page heroes, card grids, eyebrow labels above headings, and unicode glyphs standing in for icons.

**Key Characteristics:**
- Dark 44px global header, 248px white step navigation, gray work plane, optional 360px help panel on the right.
- White 1px-line containers with a title row, short description and right-aligned actions.
- Console blue only for links, primary buttons and selection.
- Status is icon + text, never color alone.
- Pretendard for UI; system mono only for code, column names, SQLSTATE codes and measurements.
- Light mode and a full dark mode driven by `prefers-color-scheme`.

## Colors

A neutral console palette with a single interactive blue, a semantic status set, and a separate dataviz series pair.

### Primary
- **Console Blue** (#0a6cce; dark #5aa3ec): links, primary buttons, the "정보" and "자세히" text buttons, the current side-nav item, selected tabs, selected rows and presets, focus rings, range-slider accent. Nothing decorative.
- **Console Blue Hover** (#075aac; dark #7db6f0): hover and active state of the primary button only.
- **Console Blue Soft** (#e9f2fc; dark #13253b): selection fill behind the current nav item, selected table rows, selected presets and the selected ERD node halo.

### Neutral
- **Header Carbon** (#161a21; dark #0b0d11) with **Header Ink** (#eef1f5), **Header Muted** (#9aa4b3) and **Header Line** (#2b313b): the global header only.
- **Work Plane** (#f1f2f4; dark #0f1216): the page background behind containers.
- **Surface** (#ffffff; dark #161a20): containers, side nav, help panel, buttons, inputs.
- **Surface 2** (#f7f8fa) and **Surface 3** (#eceef2): table headers, row hover, the result cell of the experiment guide, inline code background, pressed states.
- **Line** (#e1e4e9) and **Line Strong** (#c8cdd5): every divider and container edge; strong for button, input and badge outlines.
- **Ink** (#0f1419), **Ink 2** (#3c4654), **Muted** (#646e7c): primary text, secondary text and nav links, captions and labels.

### Status
- **Success / Error / Warning / Info**, each in three strengths: a vivid icon color (#0ca30c / #d03b3b / #d98a00 / #2a78d6), a darker text "ink" (#0a6e0a / #b02a2a / #8a5600 / #1d5ea8) and a soft alert fill (#e9f6e9 / #fcecec / #fdf4e3 / #e9f1fc). Alert borders mix the icon color at 35-45% into transparent.

### Data visualization
- **Series A, blue** (#2a78d6; dark #3987e5) and **Series B, orange** (#eb6834; dark #d95926): the validated dataviz pair. In the race trace, A is the SELECT segment and B the INSERT segment; in the index comparison, A and B are the two configurations. The wait between them is Muted with a hatch mask.
- **Sequential blue ramp** (13 steps, #cde2fb to #0d366b, reversed in dark mode so "0" is darkest): the heatmap's only fill. Cell text flips between white and near-black at the ramp's midpoint.
- **Seat grade palette** (`cases/01-ticket-booking/gradePalette.ts`: red, orange, gold, green, teal, blue, pink, gray, each with a light and a dark value): the DB stores only the key in `grades.color` (Q28, Q29) and the screen picks the value. It fills seat-map grade cells and their legend, nothing else. Every value holds 3:1 or more against `--surface` in both modes, and a test keeps the key list identical to the DB CHECK. There is no purple key, per the No Lavender Rule.

### Named Rules
**The Interaction-Only Blue Rule.** Console blue marks something you can click or something you have selected. It never decorates a heading, a number, a chart series or a background panel.

**The No Lavender Rule.** No light purple, lavender or violet anywhere, in either mode, including tints, halos and gradients. The owner banned it; it does not come back.

**The Series Are Not Status Rule.** Chart series take only series-a, series-b or the sequential blue ramp. Success, error and warning colors appear in charts only as outcome markers that also carry an icon and a legend label, never as a data series.

## Typography

**Body Font:** Pretendard Variable (with Pretendard, Apple SD Gothic Neo, Noto Sans KR, system-ui)
**Mono Font:** system mono stack (ui-monospace, SF Mono, JetBrains Mono, Menlo, Consolas)

**Character:** One neutral Korean grotesk does all UI work at a compact console scale; mono appears only where the text is literally machine text.

### Hierarchy
- **Headline** (700, 22px, 1.3, -0.01em): the page title (h1), with the "정보" link inline after it.
- **Title** (700, 15-16px, 1.3): container, explainer and help-panel headings.
- **Stat** (700, 20px, tabular numbers): summary measurements on experiment pages.
- **Body** (400, 14px, 1.55): default text; page descriptions capped at 82ch, container descriptions at 90ch.
- **Body dense** (400-600, 13.5px): tables, buttons, nav links, alerts, help body (line-height 1.7 there).
- **Label** (600-700, 12-12.5px): table headers, key-value keys, explainer cell headings, stat labels, hints. Sentence case Korean, never uppercase-tracked.
- **Mono** (0.88em): code, SQL, column names, SQLSTATE codes, numeric inputs, trace tooltips.

### Named Rules
**The One Line Rule.** The default view shows one short line per item plus numbers and charts. Longer explanation goes behind "자세히" or into a help-panel topic, never into the default view.

**The Machine Text Rule.** Mono is reserved for code, identifiers, SQLSTATE codes and measurements. Prose, labels and headings are always Pretendard.

**The Tabular Numbers Rule.** Every measurement column and stat uses tabular numerals and right alignment in tables.

## Layout

An app shell grid: a 44px global header row over a workspace of `248px | 1fr`, which becomes `248px | 1fr | 360px` when the help panel is open. The main column scrolls independently; pages cap at 1440px with 20px 24px 48px padding and stack containers in a single column with 16px gaps. Two-up groupings use a 2-column grid that collapses below 1100px; the race page uses a 340px scenario column beside the results.

Spacing runs on a 4px base with 8, 16, 20 and 24 doing most of the work: 16px between containers, 14-16px by 20px inside container heads and bodies, 10px by 16px table cells.

Below 960px the side nav is hidden and replaced by a sticky horizontal pill bar of pages; the help panel becomes a fixed right overlay with the panel shadow. Below 640px the header drops the case name and button text, and the DB status shows a short label (long text stays for screen readers). The experiment guide grid goes 4 → 2 → 1 columns at 1200px and 640px.

### Named Rules
**The First Viewport Rule.** Left: step navigation. Right: breadcrumbs, title with "정보", one-line description, primary action at top right; then the step summary or the experiment guide.

## Elevation & Depth

Flat, line-drawn layering. Depth comes from the tonal stack (header carbon, gray plane, white surface, surface-2 fills) and 1px lines, not shadows. Containers carry only a hairline lift; real shadow is reserved for things that float over content.

### Shadow Vocabulary
- **Hairline lift** (`box-shadow: 0 1px 2px rgb(15 20 25 / 0.04)`): resting containers and ERD table nodes.
- **Panel** (`box-shadow: 0 8px 24px rgb(15 20 25 / 0.12), 0 1px 3px rgb(15 20 25 / 0.08)`; darker in dark mode): tooltips, popovers, and the help panel when it overlays on narrow screens.
- **Selection halo** (`box-shadow: 0 0 0 3px var(--accent-soft)`): the selected ERD node. Selected presets use an inset 1px accent ring.

### Named Rules
**The Floating-Only Shadow Rule.** A real shadow means the element floats above the page (tooltip, overlay panel). Anything that sits in the flow is drawn with lines.

## Shapes

Small, consistent corners: 8px on containers, alerts and ERD nodes; 5px on buttons, inputs, segmented controls, presets, tooltips and code blocks; 4px on inline code and copy buttons; 3px inside segmented buttons and small tags; full pills only for count badges and the mobile page bar. Step numbers in the side nav and the overview guide are 20-22px circles. Planned (undecided) things use a dashed border and translucent fill, so "undecided means undrawn" is visible in the shape language itself.

## Components

### Buttons
- **Shape:** gently squared (5px), 32px tall, 0 14px padding, 13.5px semibold, optional 16px leading icon.
- **Primary:** console blue fill, white text; hover and active shift to the deeper blue. One per area, top right.
- **Normal:** white surface, strong-line border, ink text; hover darkens the border to ink-2 and fills surface-2; active fills surface-3.
- **Loading / Disabled:** a 13px spinner replaces the icon and the button sets aria-busy; disabled is 50% opacity with not-allowed cursor.
- **Text buttons:** "정보" and "자세히" are borderless blue 13px semibold text; "자세히" carries a chevron icon and toggles to "접기".
- **Icon button:** 30px square, transparent until hover (surface-3).
- **Header button:** 28px, transparent with a header-line border, 6% white wash on hover.

### Containers
- **Corner Style:** 8px.
- **Background:** surface on the gray work plane.
- **Border:** 1px line; head separated by a 1px line.
- **Head:** title (15px bold) with optional "정보" link, one muted 13px description line, actions at right.
- **Body:** 16px 20px, or flush for tables.

### Experiment Guide ("실험 안내")
The signature component at the top of every experiment page: a container with four equal cells split by 1px lines, 확인할 것 · 방법 · 읽는 법 · 결과, each a 12px muted label over one short 14px line. The result cell sits on surface-2, shows "실행하면 여기에 나와요" until run, then a semibold result tinted with success-ink or error-ink. Long text opens below via "자세히".

### Tables
Full-width, 13.5px, 10px 16px cells, 1px line row dividers, surface-2 header row in 12.5px bold ink-2, surface-2 row hover, numeric columns right-aligned with tabular numbers. Decision numbers (Q번호) are bold ink-2 and never wrap. Expandable rows use a chevron toggle and open a surface-2 detail row.

### Status and Alerts
- **Status indicator:** 16px icon + semibold word in the status ink color; stopped and pending are muted.
- **Alert:** 8px corner, soft status fill, tinted border, colored icon, optional bold title, 13.5px body.
- **Confirm strip:** warning-soft inline bar for hard-to-undo actions, with the buttons at its right.

### Navigation
- **Global header:** carbon, 44px, brand at left, case name after a header-line divider, DB connection status (icon + text) and header buttons at right.
- **Side nav:** white, 248px, steps with numbered circles (filled blue when built, outlined and muted when planned, plus a "planned" badge), page links indented 48px in 13.5px ink-2. Current page: blue-soft fill, blue text, 2px inset blue left edge.
- **Breadcrumbs:** 13px muted with a 12px chevron icon separator.
- **Tabs:** inside containers, 2px blue underline and bold blue text when selected.
- **Segmented control:** surface-2 track; the pressed option is a white raised segment with a 1px strong-line ring.

### Inputs
Numeric inputs are 30px, 5px corner, strong-line border, mono 13px, right-aligned. Range sliders use the accent color. Presets are full-width line-bordered buttons with a bold title and a muted hint; the pressed preset gets blue-soft fill and an inset blue ring.

### Help Panel ("정보")
Right column (360px) with a sticky head (15px title, close icon button) and a 13.5px body at line-height 1.7; term lists set the term in mono. Escape closes it. On narrow screens it overlays from the right with the panel shadow.

### Data Visualization
- **Trace waterfall:** one row per request, SELECT and INSERT segments in series A and B, the wait between them muted and hatched, outcome markers as small icons with legend labels.
- **Heatmap:** sequential blue ramp only, value printed in each cell, mono-free axis labels, hover tooltip.
- **Bar comparison:** series A versus series B, values labeled.
- **Plan tree and ERD:** line-drawn nodes; the ERD is a React Flow canvas of white 8px table nodes with mono column names, selection in blue with a soft halo, planned tables dashed.

### Icons
One authored set on a 16px grid, 1.5 stroke, round caps and joins, `currentColor`; only "play" is filled. Every icon is an SVG from this set.

## Do's and Don'ts

### Do:
- **Do** keep the default view to one short line per item, plus numbers and charts; put long explanation behind "자세히" or in a help-panel topic.
- **Do** pair every status color with an icon and a word (success, error, warning, info, stopped, pending).
- **Do** reserve console blue (#0a6cce, dark #5aa3ec) for links, primary buttons, selection and focus.
- **Do** draw chart series only from series-a #2a78d6 / series-b #eb6834 (dark #3987e5 / #d95926), and heatmaps only from the sequential blue ramp.
- **Do** set code, column names, SQLSTATE codes and measurements in system mono with tabular numbers; everything else in Pretendard.
- **Do** build pages from the shell: dark header, step nav, breadcrumbs, title with "정보", containers with 1px lines.
- **Do** mark planned steps and tables as planned (muted, dashed, badge) and never draw them as decided.
- **Do** write Korean UI copy plain and short.

### Don't:
- **Don't** use light purple, lavender or violet in any form.
- **Don't** use status colors (success, error, warning) as chart series colors.
- **Don't** put eyebrow or kicker labels above headings.
- **Don't** use unicode glyphs (arrows, checkmarks, bullets, stars) as icons; draw them in the 16px icon set.
- **Don't** build marketing heroes or card grids; decisions are tables, experiments are screens.
- **Don't** put shadows on in-flow elements beyond the hairline lift.
- **Don't** hard-code hex values in components; use the tokens so dark mode follows.
