# Daraja brand

**Daraja** is Swahili for _bridge_. The product sits between visitors who write in any language and
hosts who answer from a basic phone.

<p>
  <img src="daraja-horizontal.svg" alt="Daraja logo" height="56">
  &nbsp;&nbsp;
  <img src="daraja-app-icon.svg" alt="Daraja app icon" height="56">
</p>

## The mark

One arch made of two halves that meet in the middle: terracotta for the visitor's side, brown for
the host's side. The gap at the top is where Daraja works. The road runs past both ends so the shape
reads as a bridge, not a doorway or a gauge.

## Files

| File                             | Use                                                       |
| -------------------------------- | --------------------------------------------------------- |
| `daraja-horizontal.svg`          | Default lockup: headers, documents, slides                |
| `daraja-horizontal-reversed.svg` | The same on dark backgrounds                              |
| `daraja-vertical.svg`            | Square-ish spaces: social avatars, posters                |
| `daraja-mark.svg`                | The mark alone, on light backgrounds                      |
| `daraja-mark-reversed.svg`       | The mark alone, on dark backgrounds                       |
| `daraja-mark-mono.svg`           | One colour: stamps, embossing, single-ink print           |
| `daraja-app-icon.svg`            | Favicon and app icon (also `apps/web/public/favicon.svg`) |

The wordmark is outlined from **Fraunces Bold**, so the files never depend on a font being
installed. In the web app the mark is the `DarajaMark` component (`apps/web/src/components/logo.tsx`),
coloured by theme tokens.

## Colours

| Role                      | Hex       | Theme token    |
| ------------------------- | --------- | -------------- |
| Host half, road, wordmark | `#4F2B1A` | `--primary`    |
| Visitor half              | `#CB6440` | `--accent`     |
| Wordmark ink              | `#2D1A10` | `--foreground` |
| Reversed (on dark)        | `#FAF2E6` | `--background` |

## Usage

- **Clear space:** keep at least the height of one arch leg free on every side.
- **Minimum size:** mark 16 px tall on screen, or use the app icon. Lockup 80 px wide.
- **Backgrounds:** full colour on cream or white, reversed on brown or dark. Never on photos without a solid panel behind.
- **Don't** stretch it, recolour the halves, swap their sides, close the gap at the top, or add shadows or outlines.

## Concepts considered

- **Keystone** (stone arch with a terracotta keystone): a flat smudge at favicon sizes, and the keystone read as a crown.
- **Message bridge** (speech bubble with an arch cut out): the dot above the arch read as a person avatar.
- **Two halves** (chosen): the clearest at every size; the legs and road were added so it reads as a bridge.
