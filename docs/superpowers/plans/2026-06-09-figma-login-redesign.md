# Figma Login Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the login page theme, typography, illustration panel, and form layout to align exactly with the Figma design file (`figma_design.json`) using burgundy (`#7F265B`) and dark burgundy (`#73114B`) colors.

**Architecture:**
1. Configure new Tailwind colors in `tailwind.config.ts`.
2. Refactor `FigmaLoginForm.tsx` with updated typography (Nunito Sans), colors (`#7F265B`), and input/button styles.
3. Refactor `FigmaLoginGraphic.tsx` to display a customized JUET Nexus title/subtitle over the linear burgundy gradient with circular vector overlay layouts.

**Tech Stack:** React, Next.js, Tailwind CSS.

---

### Task 1: Update Tailwind Color Config
Add the newly extracted Figma design color keys to the Tailwind configuration so they can be referenced inside classes.

**Files:**
- Modify: `frontend/tailwind.config.ts`

- [ ] **Step 1: Edit `frontend/tailwind.config.ts`**
  Add the custom color codes to the config's `extend.colors` block.
  ```typescript
  // Find lines in extend.colors and append:
  "figma-burgundy": "#7F265B",
  "figma-burgundy-dark": "#73114B",
  "figma-lavender-light": "#EDE8FF",
  "figma-lavender-medium": "#9D93E2",
  "figma-dark-gray": "#525252",
  "figma-input-border": "#E0E0E0",
  ```

- [ ] **Step 2: Compile the frontend locally to verify no configuration issues**
  Run: `npm run build --workspace frontend`
  Expected: Command succeeds with zero compiler/bundler errors.

- [ ] **Step 3: Commit**
  ```bash
  git add frontend/tailwind.config.ts
  git commit -m "style: configure custom Figma design colors in Tailwind"
  ```

---

### Task 2: Redesign the Login Form Component
Refactor the form component to use the new color schemes, borders, placeholders, button background states, and labels matching the Figma design specifications.

**Files:**
- Modify: `frontend/components/FigmaLoginForm.tsx`

- [ ] **Step 1: Modify `FigmaLoginForm.tsx` styling classes**
  Update typography to `font-nunito`, colors to `text-figma-dark-gray`, borders to `border-figma-input-border`, and focus rings/link highlights to `figma-burgundy`.
  - Header:
    Change title to:
    ```tsx
    <h1 className="text-[36px] font-bold text-figma-dark-gray font-nunito tracking-tight mb-2 leading-tight">
      Login to your Account
    </h1>
    ```
    Change description to:
    ```tsx
    <p className="text-base text-gray-500 font-nunito">
      Seamless connection to your academic profile
    </p>
    ```
  - Inputs:
    Change borders to `border-figma-input-border` and focus states:
    ```tsx
    className="w-full bg-white border border-figma-input-border rounded-lg px-4 py-3 text-sm text-figma-dark placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-figma-burgundy focus:border-transparent transition-all font-nunito"
    ```
  - Remember Me Checkbox & Forgot Password:
    ```tsx
    <span className="text-xs font-semibold text-gray-400 font-nunito">Remember Me</span>
    // ...
    <button type="button" className="text-xs font-semibold text-figma-burgundy hover:text-figma-burgundy-dark transition-colors font-nunito">
      Forgot Password?
    </button>
    ```
  - Login Button:
    Change button background to `bg-figma-burgundy` and hover states:
    ```tsx
    className="w-full bg-figma-burgundy hover:bg-figma-burgundy-dark text-white font-bold py-3.5 px-4 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-figma-burgundy disabled:opacity-70 flex justify-center items-center gap-2 mt-6 font-nunito text-lg"
    ```

- [ ] **Step 2: Compile the frontend locally**
  Run: `npm run build --workspace frontend`
  Expected: Compiled successfully.

- [ ] **Step 3: Commit**
  ```bash
  git add frontend/components/FigmaLoginForm.tsx
  git commit -m "style: redesign login form component with Figma colors and Nunito typeface"
  ```

---

### Task 3: Redesign the Login Graphic Panel
Rebuild the left graphic panel using a linear gradient of the burgundy shades and customize the visual circles, vector mockups, and text titles.

**Files:**
- Modify: `frontend/components/FigmaLoginGraphic.tsx`

- [ ] **Step 1: Rebuild `FigmaLoginGraphic.tsx`**
  Replace colors in the panel container with a gradient from `from-figma-burgundy-dark` to `to-figma-burgundy`. Set decorative circular positions and SVGs to match the template.
  
  Code updates:
  - Panel Background:
    ```tsx
    <div className="hidden lg:flex w-1/2 flex-col items-start justify-center relative overflow-hidden bg-gradient-to-br from-figma-burgundy-dark to-figma-burgundy p-16 text-left">
    ```
  - Abstract Vector Overlays:
    ```tsx
    {/* Oval Copy 8 & 9 Overlays */}
    <div className="absolute top-[-20%] left-[-20%] w-[500px] h-[500px] rounded-full bg-figma-burgundy opacity-40 blur-[4px] pointer-events-none" />
    <div className="absolute bottom-[-10%] right-[-10%] w-[350px] h-[350px] rounded-full bg-figma-lavender-medium opacity-20 blur-[2px] pointer-events-none" />
    <div className="absolute top-[15%] right-[10%] w-[80px] h-[80px] rounded-full bg-figma-lavender-light opacity-10 pointer-events-none" />
    ```
  - Typography Content:
    Replace text headers with customized JUET Nexus messages:
    ```tsx
    <div className="relative z-10 w-full max-w-lg">
      <h2 className="text-4xl lg:text-5xl font-extrabold text-white mb-6 font-nunito leading-tight">
        Turn WebKiosk into a premium experience.
      </h2>
      <p className="text-figma-lavender-light opacity-90 text-lg lg:text-xl font-medium font-nunito leading-relaxed">
        Access your attendance, simulate safe classes, and view your academic grades instantly in a high-performance dashboard.
      </p>
    </div>
    ```

- [ ] **Step 2: Verify the whole workspace builds successfully**
  Run: `npm run build`
  Expected: Successful production compilation for all workspaces.

- [ ] **Step 3: Commit**
  ```bash
  git add frontend/components/FigmaLoginGraphic.tsx
  git commit -m "style: rebuild login graphic panel with customized copy and burgundy gradient theme"
  ```
