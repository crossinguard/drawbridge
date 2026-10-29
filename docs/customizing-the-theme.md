# Customizing the Drawbridge theme

Drawbridge's colors are centralized in `src/styles/starwind.css`. In most cases,
you can change the entire interface without editing individual components.

This guide is for someone working with the Drawbridge source code. It covers
changing colors, adjusting light and dark modes, and checking the result.

## Understand the three layers

The theme has three layers:

1. **Palette scales** such as `poseidon`, `seagoddess`, and `gruyrecheese`
   define the available color shades.
2. **Semantic tokens** such as `primary`, `muted`, and `accent` assign those
   colors to interface roles.
3. **Components** use semantic utilities such as `bg-primary`, `bg-card`, and
   `text-muted-foreground`.

Change a palette value to alter a color everywhere that shade is used. Change a
semantic token to alter one interface role. Avoid adding raw color utilities to
individual components when a semantic token already exists.

## Theme files

| File                                     | What it controls                                         |
| ---------------------------------------- | -------------------------------------------------------- |
| `src/styles/starwind.css`                | Palette scales, light `:root` tokens, and `.dark` tokens |
| `src/styles/base/global.css`             | Browser `color-scheme` and global body colors            |
| `src/layouts/DrawbridgeLayout.astro`     | No-flash theme initialization                            |
| `src/components/drawbridge/Header.astro` | Light/dark theme toggle                                  |
| `astro.config.mjs`                       | Installable app's manifest theme and background colors   |
| `scripts/e2e-test.ts`                    | Browser assertions for the active theme                  |

## Start the site locally

From the repository root:

```bash
bun install
bun dev
```

Open the local address printed by Astro. Keep the site running while you edit;
Astro will refresh the page as files change.

## Change an existing color

Palette scales live inside `@theme` in `src/styles/starwind.css`. For example:

```css
@theme {
  --color-poseidon-300: #72c0f9;
  --color-poseidon-700: #0f4c72;
}
```

Replace either hex value with your chosen color. The semantic tokens that
reference that shade will update automatically.

Keep the numbered shade names meaningful: `50` should be the lightest shade and
`950` the darkest. If your replacement has a very different lightness, update
the whole scale rather than putting a dark color in a light-shade slot.

## Change an interface role

Light-mode assignments live in `:root`. Dark-mode assignments live in `.dark`.
For example, this changes the primary action color without changing the
Poseidon palette itself:

```css
:root {
  --primary: var(--color-poseidon-800);
  --primary-foreground: var(--color-gruyrecheese-50);
}

.dark {
  --primary: var(--color-poseidon-200);
  --primary-foreground: var(--color-poseidon-950);
}
```

Always review the base color and its `-foreground` partner together. The
foreground is the text or icon color displayed on that base color.

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

For example:

```css
:root {
  --accent: var(--color-butternut-200);
  --accent-foreground: var(--color-gruyrecheese-950);
}

.dark {
  --accent: var(--color-butternut-300);
  --accent-foreground: var(--color-butternut-950);
}
```

Use the header toggle to check both modes. Also check your operating system's
light and dark settings, because Drawbridge follows the system preference until
a visitor explicitly chooses a theme.

## Add another palette

Add a new scale inside the existing `@theme` block in `starwind.css`, then point
semantic tokens at it. Do not create a second theme CSS file.

```css
@theme {
  --color-forest-50: #effaf2;
  --color-forest-300: #79d895;
  --color-forest-700: #176b35;
  --color-forest-950: #071e10;
}

:root {
  --primary: var(--color-forest-700);
  --primary-foreground: var(--color-forest-50);
}

.dark {
  --primary: var(--color-forest-300);
  --primary-foreground: var(--color-forest-950);
}
```

Add every shade you reference. You can add a complete `50` through `950` scale
when you expect to use the palette in several roles.

These palette declarations make utilities such as `bg-forest-700` available,
but prefer the semantic utilities in application components.

## Change the PWA colors

The installable app manifest has separate values in `astro.config.mjs`:

```js
theme_color: "#0f4c72",
background_color: "#faf4ea",
```

Update these when your main brand or light background color changes. These are
static manifest values, not light/dark CSS tokens.

## Check accessibility

For every changed combination:

- Aim for at least **4.5:1** contrast for normal text.
- Aim for at least **3:1** for large text, icons, focus indicators, and control
  boundaries that communicate state.
- Check hover, selected, disabled, error, and keyboard-focus states.
- Do not use color as the only way to communicate meaning.
- Check both themes at mobile width and with browser zoom.

The browser tests verify selected color values, but they are not a complete
accessibility audit.

## Update the browser color assertions

`scripts/e2e-test.ts` intentionally checks the current theme. An intentional
color change can therefore produce failures such as an expected RGB value not
matching the new computed color.

Search that file for names including:

- `Gruyrecheese`
- `Poseidon`
- `Sea Goddess`
- `Pompelmo`
- `Butternut`
- `color scheme`
- `preference`

Update the expected values when the new colors are intentional. Do not remove
the assertions merely to make the suite pass; they protect the light/dark
behavior and ensure the accent roles remain visible.

## Verify the result

Run:

```bash
bun run format
bun run check
bun run check:isolation
bun run test:canvas
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
