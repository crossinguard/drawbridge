# Customizing the Drawbridge theme

Drawbridge's colors are centralized in `src/styles/starwind.css`. In most cases,
you can change the entire interface without editing individual components.

This guide is for someone working with the Drawbridge source code. It covers
changing colors, adjusting light and dark modes, and checking the result.

## Understand the four layers

The theme has four layers:

1. **Palette scales** such as `poseidon`, `seagoddess`, and `gruyrecheese`
   define the available hand-tuned color shades.
2. **Shared color buckets** named `--theme-*` connect related roles to palette
   shades and hold the light and dark color choices.
3. **Semantic tokens** such as `primary`, `muted`, and `accent` assign buckets to
   stable interface roles.
4. **Components** use semantic utilities such as `bg-primary`, `bg-card`, and
   `text-muted-foreground`.

Change a palette value to alter a color everywhere that shade is used. Change a
bucket to alter a coordinated group of roles. Override a semantic token only
when one role needs to diverge from its bucket. Avoid adding raw color utilities
to individual components when a semantic token already exists.

## Theme files

| File                                     | What it controls                                             |
| ---------------------------------------- | ------------------------------------------------------------ |
| `src/styles/starwind.css`                | Palettes, shared buckets, semantic roles, and dark overrides |
| `src/styles/base/global.css`             | Browser `color-scheme` and global body colors                |
| `src/layouts/DrawbridgeLayout.astro`     | No-flash theme initialization                                |
| `src/components/drawbridge/Header.astro` | Light/dark theme toggle                                      |
| `astro.config.mjs`                       | Installable app's manifest theme and background colors       |
| `scripts/e2e-test.ts`                    | Theme-independent browser behavior assertions                |

## Start the site locally

From the repository root:

```bash
bun install
bun dev
```

Open the local address printed by Astro. Keep the site running while you edit;
Astro will refresh the page as files change.

## Use the visual design reference

The `/design` page is available by direct URL on the local or deployed site. It
pairs code with live previews of palette scales, semantic roles, typography,
brand assets, components, and shared Drawbridge patterns. Use it alongside
`starwind.css` to see how a bucket or role change affects real interface
patterns in both themes.

The page is a visual reference, not an interactive theme editor. Make theme
changes in `src/styles/starwind.css`; the previews then reflect those source
edits.

## Change an existing color

Palette scales live inside `@theme` in `src/styles/starwind.css`. For example:

```css
@theme {
  --color-poseidon-300: #72c0f9;
  --color-poseidon-700: #0f4c72;
}
```

Replace either hex value with your chosen color. Every bucket and direct
semantic override that references that shade will update automatically.

Keep the numbered shade names meaningful: `50` should be the lightest shade and
`950` the darkest. If your replacement has a very different lightness, update
the whole scale rather than putting a dark color in a light-shade slot.

The unnumbered declarations such as `--color-poseidon` and
`--color-pompelmo` are fixed brand swatches, separate from the numbered scales
and mode-aware buckets. Changing a semantic theme does not automatically update
brand assets or the static PWA colors described below.

## Change a shared color bucket

Buckets live in `:root`, with their dark values in `.dark`. For example, this
changes the primary action colors without changing the Poseidon palette itself:

```css
:root {
  --theme-primary: var(--color-poseidon-800);
  --theme-primary-foreground: var(--color-gruyrecheese-50);
}

.dark {
  --theme-primary: var(--color-poseidon-200);
  --theme-primary-foreground: var(--color-poseidon-950);
}
```

The primary semantic roles, their sidebar equivalents, and the default success
colors all follow this bucket. A trailing `*` in the table below abbreviates a
base bucket and its `-foreground` partner.

| Bucket                                             | Connected semantic roles                          |
| -------------------------------------------------- | ------------------------------------------------- |
| `--theme-page*`                                    | Page background and foreground                    |
| `--theme-raised*`                                  | Card and popover pairs                            |
| `--theme-primary*`                                 | Primary pair                                      |
| `--theme-secondary*`                               | Secondary pair                                    |
| `--theme-emphasis`                                 | Primary-accent and secondary-accent               |
| `--theme-muted*`                                   | Muted pair                                        |
| `--theme-highlight*`                               | Accent pair; dark warning pair by default         |
| `--theme-info*`                                    | Information pair                                  |
| `--theme-success*`                                 | Success pair; aliases the primary pair by default |
| `--theme-warning*`                                 | Warning pair                                      |
| `--theme-error*`                                   | Error pair; aliases the emphasis base by default  |
| `--theme-border`, `--theme-input`, `--theme-focus` | Border, input, and outline roles                  |

Status buckets remain separately named even when they alias another bucket. To
change only success, replace `--theme-success` and
`--theme-success-foreground`; primary will not change. Warning has its own light
values and aliases the highlight bucket in dark mode, so give it explicit dark
bucket values if it should diverge there too. Error aliases the emphasis base
while keeping its own foreground; replace `--theme-error` if it should no longer
follow primary and secondary emphasis.

Sidebar roles do not need a second set of buckets: their semantic declarations
mirror the corresponding main roles.

## Decouple an interface role

Most theme changes belong in a bucket. If just one semantic role must diverge,
replace its bucket reference in the semantic-role section of `:root`. Add a
`.dark` semantic override only when that decoupled role also needs a different
dark value.

For example, this changes cards while leaving popovers on the shared raised
bucket:

```css
:root {
  --card: var(--color-gruyrecheese-100);
  --card-foreground: var(--color-gruyrecheese-950);
}

.dark {
  --card: var(--color-gruyrecheese-800);
  --card-foreground: var(--color-gruyrecheese-50);
}
```

Always review the base color and its `-foreground` partner together. The
foreground is the text or icon color displayed on that base color. Keep these
assignments in the existing blocks rather than creating another theme file.

### Current semantic roles

| Token                                | Used for                                            |
| ------------------------------------ | --------------------------------------------------- |
| `background` / `foreground`          | Page surface and default text                       |
| `card` / `card-foreground`           | Cards and their text                                |
| `popover` / `popover-foreground`     | Menus, sheets, and other floating surfaces          |
| `primary` / `primary-foreground`     | Main actions and links                              |
| `primary-accent`                     | Emphasis and primary-link hover states              |
| `secondary` / `secondary-foreground` | Tool tiles, secondary badges, and secondary actions |
| `secondary-accent`                   | Source-label emphasis                               |
| `muted` / `muted-foreground`         | Quiet surfaces and supporting text                  |
| `accent` / `accent-foreground`       | Selected items and highlighted states               |
| `info` / `info-foreground`           | Informational states                                |
| `success` / `success-foreground`     | Success states                                      |
| `warning` / `warning-foreground`     | Warnings                                            |
| `error` / `error-foreground`         | Errors                                              |
| `border`                             | Default borders                                     |
| `input`                              | Form-control borders                                |
| `outline`                            | Keyboard focus indicators                           |
| `sidebar-*`                          | Sidebar equivalents of the main roles               |

A token can affect more than one component. For example, changing `accent`
updates selected views in both explorers. After changing a role, check every
place where that role appears rather than only the homepage.

## Customize light and dark modes separately

Light and dark themes should be designed independently. Do not assume that a
color readable in light mode will remain readable in dark mode.

A typical pattern is:

- Light mode uses darker accent shades on pale Gruyrecheese surfaces.
- Dark mode uses brighter accent shades on dark Gruyrecheese surfaces.
- Bright buttons in dark mode use dark foreground text.

For example, the highlight bucket gives selected states different light and
dark values while the `accent` semantic mapping remains unchanged in `:root`:

```css
:root {
  --theme-highlight: var(--color-butternut-200);
  --theme-highlight-foreground: var(--color-gruyrecheese-950);
}

.dark {
  --theme-highlight: var(--color-butternut-300);
  --theme-highlight-foreground: var(--color-butternut-950);
}
```

Keep `.dark` focused on bucket overrides. Semantic roles inherit their wiring
from `:root`, and aliases follow the active mode: success tracks the current
primary pair, while dark warning tracks the current highlight pair. The only
semantic declarations that need repeating in `.dark` are intentional exceptions
like the decoupled card example above.

Use the header toggle to check both modes. Also check your operating system's
light and dark settings, because Drawbridge follows the system preference until
a visitor explicitly chooses a theme.

## Add another palette

Add a new scale inside the existing `@theme` block in `starwind.css`, then point
one or more buckets at it. Do not create a second theme CSS file.

```css
@theme {
  --color-forest-50: #effaf2;
  --color-forest-300: #79d895;
  --color-forest-700: #176b35;
  --color-forest-950: #071e10;
}

:root {
  --theme-primary: var(--color-forest-700);
  --theme-primary-foreground: var(--color-forest-50);
}

.dark {
  --theme-primary: var(--color-forest-300);
  --theme-primary-foreground: var(--color-forest-950);
}
```

Add every shade you reference. You can add a complete `50` through `950` scale
when you expect to use the palette in several roles.

These palette declarations make utilities such as `bg-forest-700` available,
but prefer the semantic utilities in application components.

## Change the PWA colors

The installable app manifest has separate values in `astro.config.mjs`:

```js
theme_color: "#0a3d5c",
background_color: "#f5deb3",
```

Update these when your fixed brand or light background color changes. These are
static manifest values, not light/dark CSS tokens, and cannot reference a CSS
bucket. The PWA caches application assets rather than imported course data;
these colors do not affect that privacy behavior.

## Check accessibility

For every changed combination:

- Aim for at least **4.5:1** contrast for normal text.
- Aim for at least **3:1** for large text, icons, focus indicators, and control
  boundaries that communicate state.
- Check hover, selected, disabled, error, and keyboard-focus states.
- Do not use color as the only way to communicate meaning.
- Check both themes at mobile width and with browser zoom.

The browser tests verify theme behavior and semantic selected states, but they
are not a complete accessibility audit.

## Keep browser tests theme-agnostic

`scripts/e2e-test.ts` deliberately avoids fixed hex or RGB expectations. You can
change the palette without rewriting tests. The suite checks the light/dark
`color-scheme`, distinct foreground/background values, different light and dark
surfaces, saved preferences, and semantic selected states such as `bg-accent`
with `aria-pressed`.

Keep new assertions focused on these behaviors rather than particular colors.
Contrast and the visibility of each accent role still need manual review when
the theme changes.

## Verify the result

Run:

```bash
bun run format
bun run check
bun run check:isolation
bun run test:canvas
bun run test:transcript
bun run build
bun run test:e2e
```

The Canvas checks should remain unaffected by a visual-only change. Run the
browser tests after a production build so they check the generated site.

## Reset a saved display preference

Drawbridge stores only the display preference under the browser storage key
`colorTheme`. Its value is `light`, `dark`, or `system`.

To return to following the operating system, use the browser console while on
the Drawbridge site:

```js
localStorage.setItem("colorTheme", "system");
location.reload();
```

To remove the preference entirely:

```js
localStorage.removeItem("colorTheme");
location.reload();
```

The no-flash initialization will recreate it as `system` on the next load.
Neither action is needed to clear course data: imported courses are never put in
browser storage.

## Troubleshooting

### A component did not change

Find which semantic utility it uses, such as `bg-secondary` or
`text-muted-foreground`, then update that token. Check for a more specific local
style before adding another color override.

### Light mode changed but dark mode did not

Update the corresponding assignment in `.dark`. The two token sets are
independent.

### The site follows the wrong theme after reload

A saved `light` or `dark` choice overrides the operating system. Reset
`colorTheme` to `system` as shown above.

### The wrong colors flash before the page loads

Keep `ThemeInitScript` in the document head in
`src/layouts/DrawbridgeLayout.astro`. It applies the saved or system theme before
the page becomes visible.

### Native controls look wrong in dark mode

Keep the `html` and `html.dark` `color-scheme` rules in
`src/styles/base/global.css`. These help browsers render native controls with
the appropriate scheme.

## Final checklist

- Palette changes are inside `src/styles/starwind.css`.
- Light and dark semantic tokens are both updated.
- Every changed base color has a readable foreground.
- Components still use semantic utilities.
- PWA colors are updated if the main brand or background changed.
- Browser color assertions reflect the intentional new theme.
- Both themes pass the build, browser, keyboard, and responsive checks.
