# Spec: Figma Login Page Redesign

## 1. Goal & Context
The goal of this task is to redesign the JUET Nexus login page (`frontend/app/login/page.tsx` and related components) to match the layout, colors, typography, and styling properties of the Figma design file (`figma_design.json`) fetched from the community templates. 

The left illustration panel will be customized with context-relevant JUET Nexus branding instead of general template text, and the right login form panel will adopt the exact styling parameters (color `#7F265B`, clean text colors, and font styles) present in the Figma layers.

---

## 2. Color Palette & Theme Definitions

We will add the following color tokens to `frontend/tailwind.config.ts` under `colors`:
*   `figma-burgundy`: `#7F265B` (Primary brand color for buttons, links, checkbox borders)
*   `figma-burgundy-dark`: `#73114B` (Dark burgundy for text headings and illustration backgrounds)
*   `figma-lavender-light`: `#EDE8FF` (Lighter overlay tone)
*   `figma-lavender-medium`: `#9D93E2` (Medium accent tone)
*   `figma-dark-gray`: `#525252` (For main text headers)
*   `figma-input-border`: `#E0E0E0` (For thin, clean input lines)

---

## 3. Component Updates

### A. Login Page Container (`frontend/app/login/page.tsx`)
*   Grid layout containing `FigmaLoginGraphic` (left side, hidden on mobile) and `FigmaLoginForm` (right side, centered).
*   Maintains the responsive classes (`grid lg:grid-cols-2 min-h-screen bg-gray-50`).

### B. Login Form Component (`frontend/components/FigmaLoginForm.tsx`)
*   Uses `font-nunito` for all text blocks to render the Nunito Sans font.
*   **Header:** 
    *   Title: *"Login to your Account"* (`font-size: 36px` -> `text-3xl font-bold font-nunito tracking-tight text-figma-dark-gray mb-2`).
    *   Description: *"Seamless connection to your academic profile"* (`font-size: 16px` -> `text-base text-gray-500 font-nunito`).
*   **Role Selector / Inputs:**
    *   Standardized input boxes with border color `figma-input-border` (`#E0E0E0`).
    *   Placeholders styled with `#E0E0E0` color.
    *   Focus state ring colors set to `figma-burgundy` (`#7F265B`).
*   **Actions:**
    *   Checkbox labeled *"Remember Me"* with border `figma-burgundy` and check icon `figma-burgundy`.
    *   Forgot Password link colored `figma-burgundy` (`#7F265B`).
*   **Submit Button:**
    *   Color: `bg-figma-burgundy` (`#7F265B`), hovering to `bg-figma-burgundy-dark` (`#73114B`).
    *   Text: *"Login"* (`font-size: 18px` -> `text-lg font-bold text-white font-nunito`).

### C. Login Graphic Panel (`frontend/components/FigmaLoginGraphic.tsx`)
*   Background set to a linear gradient: `bg-gradient-to-br from-figma-burgundy to-figma-burgundy-dark`.
*   Includes circular vector shape layers in the background:
    *   Large abstract background shapes using `#7F265B` and `#EDE8FF` / `#9D93E2` overlays.
*   **Branded Text:**
    *   Main Header: *"Turn WebKiosk into a premium experience."* (`font-size: 40px` -> `text-4xl lg:text-5xl font-extrabold text-white font-nunito leading-tight text-left mb-4`).
    *   Subtitle: *"Access your attendance, simulate classes, and view your academic grades instantly in a high-performance dashboard."* (`font-size: 20px` -> `text-lg lg:text-xl font-medium text-figma-lavender-light opacity-95 text-left`).

---

## 4. Verification Plan

### Manual Verification
*   Start the frontend development server (`npm run dev --workspace frontend`).
*   Open `http://localhost:3000/login` in the browser.
*   Verify that the color palette matches the Burgundy/Lavender Figma theme.
*   Verify that text headers, input labels, checkboxes, and buttons render in correct sizes and colors.
*   Check mobile responsiveness (left illustration panel hides on smaller screens, form card centers cleanly).
