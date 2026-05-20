---
name: Kinetic Obsidian
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1b1b1b'
  surface-container: '#1f1f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353535'
  on-surface: '#e2e2e2'
  on-surface-variant: '#c4c9ac'
  inverse-surface: '#e2e2e2'
  inverse-on-surface: '#303030'
  outline: '#8e9379'
  outline-variant: '#444933'
  surface-tint: '#abd600'
  primary: '#ffffff'
  on-primary: '#283500'
  primary-container: '#c3f400'
  on-primary-container: '#556d00'
  inverse-primary: '#506600'
  secondary: '#c8c6c5'
  on-secondary: '#313030'
  secondary-container: '#4a4949'
  on-secondary-container: '#bab8b7'
  tertiary: '#ffffff'
  on-tertiary: '#313030'
  tertiary-container: '#e5e2e1'
  on-tertiary-container: '#656464'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#c3f400'
  primary-fixed-dim: '#abd600'
  on-primary-fixed: '#161e00'
  on-primary-fixed-variant: '#3c4d00'
  secondary-fixed: '#e5e2e1'
  secondary-fixed-dim: '#c8c6c5'
  on-secondary-fixed: '#1c1b1b'
  on-secondary-fixed-variant: '#474646'
  tertiary-fixed: '#e5e2e1'
  tertiary-fixed-dim: '#c8c6c5'
  on-tertiary-fixed: '#1c1b1b'
  on-tertiary-fixed-variant: '#474746'
  background: '#131313'
  on-background: '#e2e2e2'
  surface-variant: '#353535'
typography:
  display-lg:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-sm:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  unit: 4px
  container-margin: 24px
  gutter: 16px
  card-padding: 24px
---

## Brand & Style

This design system is engineered to evoke a sense of high-performance athleticism fused with the precision of premium financial technology. The aesthetic is "Technical Minimalism"—a blend of deep obsidian surfaces, ultra-refined typography, and high-energy accents.

The target audience is the "Elite Mover": individuals who value data-driven progress and exclusive rewards. The UI should feel like a high-end dashboard found in a luxury electric vehicle or a specialized bio-tracking device. By leveraging **Glassmorphism** for depth and **High-Contrast** elements for action, the design system maintains a sophisticated atmosphere while ensuring critical fitness data is immediately legible and motivating.

## Colors

The palette is rooted in an "Ink & Neon" philosophy. 

- **Primary (#CCFF00):** A high-visibility neon green used exclusively for primary calls to action, progress indicators, and "success" states. It should be used sparingly to maintain its impact.
- **Surface Tiers:** Pure Black (#000000) serves as the base canvas to maximize OLED efficiency and contrast. Deep Gray (#121212) and Tech Gray (#1A1A1A) are used for card backgrounds and elevated surfaces.
- **Functional Accents:** Use subtle white (#FFFFFF) for primary text and a muted gray (#888888) for secondary metadata.

## Typography

Typography in this design system prioritizes a technical, "engineered" look. 

- **Headlines:** Space Grotesk provides a geometric, futuristic character suitable for bold motivation and large numerical data. Tighten letter spacing on larger displays to enhance the "sporty" feel.
- **Functional Text:** Geist is used for all UI labels and body copy. Its monospaced-influenced proportions ensure data points, like distance and time, are perfectly legible and modern.
- **Numerical Data:** Always use tabular figures for time and metric readouts to prevent horizontal jumping during active tracking.

## Layout & Spacing

The layout follows a fluid 12-column grid for desktop and a single-column stack for mobile, utilizing a strictly 4px-based rhythmic scale.

- **Negative Space:** Use generous margins (24px+) to prevent the UI from feeling cluttered, reinforcing the premium, minimalistic brand positioning.
- **Safe Areas:** On mobile, ensure all interactive elements are placed within the central "thumb zone," utilizing large floating action buttons.
- **Data Densities:** Admin dashboards should utilize the 16px gutter to separate complex chart modules, while the consumer app utilizes 32px vertical rhythm to separate high-level card components.

## Elevation & Depth

Depth is conveyed through **translucency and luminosity** rather than traditional physical shadows.

- **Glassmorphism:** Secondary surfaces use a backdrop-blur (minimum 20px) and a semi-transparent fill (8-12% opacity) to create a "floating glass" effect over the deep black background.
- **Inner Glows:** Instead of drop shadows, use a 1px subtle inner stroke in a lighter gray or a 20% opacity primary color to define card edges.
- **Luminous Elevation:** The most critical interactive elements (like an active "Start Run" button) should feature a subtle outer glow using the primary neon green, creating a "neon-on-black" aura.

## Shapes

The shape language is defined by "Hyper-Radii." Surfaces should feel organic and smooth, avoiding sharp industrial corners.

- **Cards:** Use a minimum of 24px corner radius for all main containers to create a soft, modern feel.
- **Interactive Elements:** Buttons and input fields should be fully rounded (pill-shaped) to reinforce the athletic, fluid nature of the movement.
- **Visual Continuity:** Ensure that nested elements have a proportional radius (Radius_Outer - Padding = Radius_Inner) to maintain visual harmony.

## Components

- **Buttons:** Primary buttons are pill-shaped, filled with Neon Green, and use Black text for maximum contrast. Secondary buttons are outlined with a 1px white border and no fill.
- **Progress Circles:** Use thick strokes (8px+) for rings. The background track should be a 5% opacity primary color, while the active progress should be a vibrant Neon Green gradient.
- **Floating Cards:** Feature a 1px "glass" border and 20px backdrop blur. These should appear to float over the background, triggered by scroll-based parallax where possible.
- **Modern Charts:** Use line graphs with a "glow" effect on the stroke. Area charts should use a vertical gradient from Neon Green (top) to transparent (bottom).
- **Chips/Badges:** Small, pill-shaped containers with a 10% primary fill and 1px primary border, used for categorization and reward tiers.
- **Input Fields:** Minimalist containers with a bottom-border only or a fully rounded "glass" enclosure. Active states are indicated by the border changing to Neon Green.