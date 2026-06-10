---
name: Serene Finance
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f3'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#44474e'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f1f1f1'
  outline: '#74777f'
  outline-variant: '#c4c6cf'
  surface-tint: '#475f85'
  primary: '#475f85'
  on-primary: '#ffffff'
  primary-container: '#8fa7d1'
  on-primary-container: '#233c60'
  inverse-primary: '#afc7f3'
  secondary: '#61597f'
  on-secondary: '#ffffff'
  secondary-container: '#dcd1fd'
  on-secondary-container: '#60587d'
  tertiary: '#6c5d2b'
  on-tertiary: '#ffffff'
  tertiary-container: '#b8a56c'
  on-tertiary-container: '#483b0b'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d5e3ff'
  primary-fixed-dim: '#afc7f3'
  on-primary-fixed: '#001b3c'
  on-primary-fixed-variant: '#2f476c'
  secondary-fixed: '#e7deff'
  secondary-fixed-dim: '#cbc1ec'
  on-secondary-fixed: '#1d1638'
  on-secondary-fixed-variant: '#494266'
  tertiary-fixed: '#f7e1a3'
  tertiary-fixed-dim: '#dac589'
  on-tertiary-fixed: '#231b00'
  on-tertiary-fixed-variant: '#534616'
  background: '#f9f9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e2e2e2'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  title-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  container-padding: 24px
  stack-gap: 16px
  grid-gutter: 16px
---

## Brand & Style

This design system is built for personal finance management with a focus on emotional clarity and cognitive ease. By utilizing a "Soft Modernism" approach, it transforms typically stressful financial data into an approachable, calm experience. 

The aesthetic is characterized by a "clean and modern" surface philosophy, using generous whitespace and a light-filled interface to reduce data density anxiety. It targets a modern audience that values intentional spending and mindful saving. The emotional response is one of stability and optimism, moving away from traditional "bank-like" coldness toward a lifestyle-centric financial companion.

## Colors

The palette is derived from soft, desaturated pastels that provide clear semantic differentiation without visual fatigue. 

- **Soft Blue (#8FA7D1):** Assigned to **Needs**. Evokes trust and essential stability.
- **Lavanda (#B1A7D1):** Assigned to **Wants/Lifestyle**. Represents personal fulfillment and flexibility.
- **Pastel Yellow (#E6D194):** Assigned to **Savings**. Symbolizes growth and future value.
- **Coral (#E88A8A):** Reserved for **Excess/Over-budget** states within the "Wants" category, providing a gentle but clear alert.

Surface colors should remain off-white or very light grey to ensure the pastel category colors remain the primary focus of the visual hierarchy.

## Typography

This design system exclusively uses **Inter** to maintain a highly legible, systematic, and modern feel. The typographic hierarchy relies on weight contrast rather than purely size. 

Numerical data (balances, percentages) should use `SemiBold` or `Bold` weights to ensure they are the first point of contact in the visual scan. Sub-labels and supporting text use a slightly desaturated neutral color to maintain focus on the primary figures.

## Layout & Spacing

The layout follows a **Fluid Grid** model with a maximum content width of 1200px for desktop. It utilizes an 8px base unit for all spacing increments to ensure a consistent rhythm.

- **Mobile:** Single column layout with 16px side margins.
- **Tablet:** 6-column grid with 24px margins.
- **Desktop:** 12-column grid with 24px margins.

Spacing between cards and modules should be generous (typically 24px) to allow each financial category "room to breathe," preventing the interface from feeling cluttered or overwhelming.

## Elevation & Depth

Depth is achieved through **Tonal Layers** and extremely soft shadows. Instead of harsh black shadows, this design system uses low-opacity shadows tinted with the primary blue or neutral tones to maintain the "clean" aesthetic.

Surface levels:
1. **Background:** Lightest neutral (#F9FAFB).
2. **Cards/Containers:** Pure white (#FFFFFF) with a soft 8px blur shadow.
3. **Overlays/Modals:** White with a medium 16px blur shadow and a subtle 1px neutral border to define edges against the background.

## Shapes

As requested, the primary roundedness is set to **8px (0.5rem)**. This provides a friendly, contemporary look that is neither too sharp (corporate) nor too bubbly (playful). 

This 8px radius should be applied consistently to:
- Primary data cards.
- Progress bar containers.
- Input fields.
- Buttons.

Full-width mobile sheets or large hero sections may use `rounded-xl` (24px) on top corners to create a "nested" visual feeling.

## Components

### Cards & Containers
Cards are the primary vessel for data. They must use a white background and the 8px corner radius. Headlines within cards should be `title-md`.

### Progress Bars (Category Tracking)
Progress bars use a high-contrast relationship between the background (a 10-15% opacity version of the category color) and the foreground (the solid category color). 
- **Needs:** Solid Blue bar.
- **Savings:** Solid Yellow bar.
- **Wants:** Solid Lavanda bar, transitioning to Coral if the user exceeds their limit.

### Buttons
Primary buttons should use the Soft Blue (#8FA7D1) with white text. Ghost buttons use a 1px border in the same blue. All buttons maintain the 8px roundedness.

### Input Fields
Inputs are minimal, featuring a light neutral background (#F4F4F4) and a 1px border that becomes Soft Blue on focus. Labels should use the `label-caps` style for clarity.

### Chips & Tags
Used for transaction categorization. They should be small, using the category colors at 20% opacity for the background and 100% opacity for the text to ensure WCAG accessibility.