# Kinlines

A local-first React application for calculating expected autosomal pedigree relationships, kinship coefficients, and pedigree inbreeding from GEDCOM files.

## Development

```sh
npm install
npm run dev
```

Useful checks:

```sh
npm run build
npm run lint
npm run test -- --project unit
npm run test:browser
```

Browser tests use Vitest Browser Mode, Playwright, and the locally installed Google Chrome channel.

## Current scope

- Imports `.ged` and `.gedcom` files entirely in the browser using `read-gedcom`.
- Normalizes people to two biological parent links and creates a unique phantom founder when one parent is missing.
- Validates that the pedigree has no ancestry cycles.
- Calculates relationship entries on demand with memoized dynamic programming.
- Calculates kinship, inbreeding, self-relationship, and recorded common ancestors.
- Keeps imported information in the current page session; it is not uploaded.
- Renders a zoomable, scrollable pedigree overview.

The first parser adapter currently treats `FAMC` family links as biological parentage. A future version should inspect pedigree-link qualifiers such as adoption and allow users to resolve ambiguous parentage before analysis.

## Styling

The visual system is intentionally centralized in `src/App.css`. Adjust the custom properties under `:root` to change the complete palette, typography, control radius, or panel shadow:

```css
:root {
  --color-canvas: #f2ecdf;
  --color-primary: #8e3f2b;
  --font-display: "Newsreader", Georgia, serif;
  --font-interface: "DM Sans", system-ui, sans-serif;
  --radius-control: 2px;
}
```

Dark-mode values are grouped together under `@media (prefers-color-scheme: dark)`.
