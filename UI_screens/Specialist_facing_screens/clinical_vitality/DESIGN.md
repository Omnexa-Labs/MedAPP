---
name: Vitalis Clinical
colors:
  surface: '#f5faf8'
  surface-dim: '#d6dbd9'
  surface-bright: '#f5faf8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f5f2'
  surface-container: '#eaefed'
  surface-container-high: '#e4e9e7'
  surface-container-highest: '#dee4e1'
  on-surface: '#171d1c'
  on-surface-variant: '#3d4947'
  inverse-surface: '#2c3130'
  inverse-on-surface: '#edf2f0'
  outline: '#6d7a77'
  outline-variant: '#bcc9c6'
  surface-tint: '#006a61'
  primary: '#00685f'
  on-primary: '#ffffff'
  primary-container: '#008378'
  on-primary-container: '#f4fffc'
  inverse-primary: '#6bd8cb'
  secondary: '#515f74'
  on-secondary: '#ffffff'
  secondary-container: '#d5e3fc'
  on-secondary-container: '#57657a'
  tertiary: '#0058be'
  on-tertiary: '#ffffff'
  tertiary-container: '#2170e4'
  on-tertiary-container: '#fefcff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#89f5e7'
  primary-fixed-dim: '#6bd8cb'
  on-primary-fixed: '#00201d'
  on-primary-fixed-variant: '#005049'
  secondary-fixed: '#d5e3fc'
  secondary-fixed-dim: '#b9c7df'
  on-secondary-fixed: '#0d1c2e'
  on-secondary-fixed-variant: '#3a485b'
  tertiary-fixed: '#d8e2ff'
  tertiary-fixed-dim: '#adc6ff'
  on-tertiary-fixed: '#001a42'
  on-tertiary-fixed-variant: '#004395'
  background: '#f5faf8'
  on-background: '#171d1c'
  surface-variant: '#dee4e1'
  surface-bg: '#f5faf8'
  clinical-success: '#00685f'
  clinical-info: '#0058be'
  clinical-error: '#ba1a1a'
typography:
  headline-xl:
    fontFamily: Manrope
    fontSize: 40px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.25'
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.4'
  headline-lg-mobile:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1.0'
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.0'
  caption:
    fontFamily: Inter
    fontSize: 10px
    fontWeight: '700'
    lineHeight: '1.0'
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  xs: 4px
  sm: 12px
  base: 8px
  md: 24px
  lg: 48px
  xl: 80px
  gutter: 24px
  container-max: 1280px
---

## Brand & Style
The brand identity is rooted in **Professional Trust** and **Clinical Clarity**. It targets high-stakes healthcare communication where clarity, speed, and reliability are paramount. 

The design style is **Corporate Modern with Glassmorphism accents**. It utilizes a "Medical Teal" primary palette to evoke cleanliness and health, balanced by a sophisticated "Slate Blue" secondary palette for administrative tasks. The interface employs subtle glass-like blurs on fixed elements (app bars and action menus) to maintain context and depth without sacrificing the focus required in a clinical environment.

## Colors
The palette is built on a foundation of **Medical Teal (#0d9488)**, which serves as the primary driver for action states, brand identity, and patient-sent messages. 

- **Primary**: Used for high-emphasis actions, active states, and patient messaging bubbles.
- **Secondary**: A muted slate used for secondary navigation and administrative interface elements.
- **Surface**: A soft, mint-tinted neutral (#f5faf8) reduces eye strain compared to pure white, providing a "sterile yet warm" background.
- **Doctor/Brand Palette**: For provider-sent messages, we utilize `surface-container-highest` with a defined border to contrast against the vibrant primary patient bubbles, ensuring clear differentiation in the conversation flow.

## Typography
The system uses a pairing of **Manrope** for headlines and **Inter** for functional text. 

- **Manrope** provides a modern, geometric, yet friendly feel for identity and major section headers. 
- **Inter** is used for all "data-heavy" components (body text, labels, and timestamps) to ensure maximum legibility at small sizes.
- **Hierarchical Rules**: Use `headline-md` for patient names. All metadata (timestamps, read receipts) must use `label-sm` in a muted `outline` color. Uppercase tracking is reserved for status badges and technical "vitals" labels to differentiate them from conversational text.

## Layout & Spacing
The layout follows a **Fixed-Width Content Container** model within a fluid viewport. The central canvas is constrained to 1280px to prevent chat bubbles from becoming unreadably wide on desktop monitors.

- **Gutter Strategy**: A consistent 24px (gutter) is used for horizontal safe zones.
- **Vertical Rhythm**: Messages are separated by `lg` (48px) units to create distinct "beats" in the conversation.
- **Mobile Reflow**: On mobile, the `TopAppBar` hides secondary labels and converts text-heavy buttons (like "Start Video Call") into icon-only variants. The `chat-container` height is dynamically calculated to account for the fixed header and footer message bar.

## Elevation & Depth
Depth is communicated through **Glassmorphism** and **Soft Ambient Shadows**.

- **Level 0 (Base)**: The `surface-bg` (#f5faf8).
- **Level 1 (Floating/Sticky)**: The `TopAppBar` and `BottomBar` use an 80% opacity blur (`backdrop-blur-md`) with a subtle `shadow-sm` and a `0.5px` border. This creates a "sheet" effect that feels lighter than a solid block.
- **Level 2 (Interaction)**: Patient chat bubbles and Primary Action Buttons (FABs) use `shadow-md` to appear elevated and "tappable." 
- **Level 3 (Overlays)**: Floating clinical menus use `glass-effect` with a higher blur and `shadow-lg` to clearly separate temporary actions from the primary conversation stream.

## Shapes
The system uses a **Rounded (Level 2)** shape language, balancing professional structure with organic comfort.

- **Chat Bubbles**: Use `rounded-2xl` (1.5rem). To indicate directionality, the "tail" corner (bottom-left for patient, bottom-right for provider) is set to 0.
- **Buttons & Inputs**: Standard buttons use `rounded-xl` (0.75rem), while the primary message input and floating action buttons use `rounded-full` (pill) for a friendlier, modern touch.
- **Cards/Modules**: Internal data modules (like the Vitals Share card) use `rounded-xl` to nested within the larger `rounded-2xl` bubble.

## Components
- **Buttons**: Primary buttons are high-contrast Teal with white text. Secondary buttons (within message bubbles) use semi-transparent white overlays (`white/10`) to maintain context.
- **Chat Bubbles**:
    - *Patient*: Primary Teal background, white text, no bottom-left radius.
    - *Provider*: Surface-container-highest, Slate border, dark text, no bottom-right radius.
- **Clinical Cards**: Complex data (vitals/reports) should be contained in a "card-within-a-bubble." These cards use internal grid layouts (2-column for stats) and include status micro-tags (e.g., "Synced Live").
- **Message Input**: A full-pill container with an inset "mic" icon and a separate floating "send" button. 
- **Badges**: Small, uppercase, high-letter-spacing tags used for "Specialist" or "Online" indicators, often with a 10% opacity background of the primary color.
- **Floating Clinical Menu**: A vertical stack of high-affordance buttons with leading icons, appearing only on trigger to keep the clinical workspace clean.