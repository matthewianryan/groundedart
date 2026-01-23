# UI Redesign Plan - Map & Functional Pages

## Overview
This document outlines the plan to redesign the Map, Node Detail, and Capture pages to match the elegant, tactile design theme established in the Landing and Registration pages.

## Design Theme Analysis

### Current Design System (Landing/Registration)
- **Color Palette:**
  - Primary: `grounded-copper` (#D97706) - Zambian copper
  - Accent: `grounded-clay` (#92400E) - Red clay earth
  - Background Light: `grounded-parchment` (#F5F5F4) - Raw canvas/paper
  - Background Dark: `grounded-charcoal` (#1A1715) - Warm dark grey
  - Text: `grounded-charcoal` / `grounded-parchment` with opacity variants

- **Typography:**
  - Headings: Bold, uppercase, wide tracking (`tracking-tight`, `tracking-widest`)
  - Display text: Serif fonts for "Lore" and "Story" sections
  - Body: Sans-serif (Inter) with relaxed leading

- **Components:**
  - Cards: `card-light` / `card-dark` with organic shadows
  - Buttons: `btn-tactile-light` / `btn-tactile-dark` with tactile shadows
  - Smooth animations using Framer Motion
  - Hover effects: scale, translate, color transitions
  - Backdrop blur effects for depth

- **Design Principles:**
  - Minimalistic: Only essential features visible
  - Tactile: Physical, touchable feel with shadows and depth
  - Organic: Natural, warm color palette
  - Animated: Smooth transitions and micro-interactions

### Current Map UI Issues
1. **Styling:** Uses inline styles and old CSS classes instead of Tailwind + design system
2. **Components:** Basic HTML elements instead of styled cards/buttons
3. **Colors:** Generic grays instead of grounded color palette
4. **Typography:** System fonts without the established typography hierarchy
5. **Animations:** No transitions or micro-interactions
6. **Layout:** Functional but not visually cohesive with landing page

---

## Implementation Plan

### Phase 1: Design System Foundation
**Goal:** Create reusable components and utilities that match the landing page design

#### Task 1.1: Create Shared UI Components
- **Files to create:**
  - `apps/web/src/components/ui/Button.tsx` - Tactile button component
  - `apps/web/src/components/ui/Card.tsx` - Card component (light/dark variants)
  - `apps/web/src/components/ui/Badge.tsx` - Status badges (rank, upload status)
  - `apps/web/src/components/ui/Panel.tsx` - Side panel component
  - `apps/web/src/components/ui/Input.tsx` - Form inputs matching theme
  - `apps/web/src/components/ui/Select.tsx` - Select dropdowns
  - `apps/web/src/components/ui/Alert.tsx` - Alert/error messages

- **Acceptance Criteria:**
  - Components use `card-light`/`card-dark` and `btn-tactile-*` classes
  - Support dark mode via `dark:` variants
  - Include hover/focus states with animations
  - Match typography and spacing from landing page
  - Export from `apps/web/src/components/ui/index.ts`

#### Task 1.2: Create Typography Utilities
- **Files to create:**
  - `apps/web/src/styles/typography.css` - Typography utility classes
  - Add to `styles.css` or create Tailwind component classes

- **Classes to define:**
  - `.text-heading-display` - Large display headings (like landing hero)
  - `.text-heading-section` - Section headings
  - `.text-heading-card` - Card titles
  - `.text-body` - Body text with proper leading
  - `.text-muted` - Muted/secondary text with opacity

- **Acceptance Criteria:**
  - Typography matches landing page hierarchy
  - Proper font weights, sizes, and tracking
  - Dark mode variants included

#### Task 1.3: Create Animation Utilities
- **Files to create:**
  - `apps/web/src/utils/animations.ts` - Reusable animation variants
  - `apps/web/src/components/ui/AnimatedSection.tsx` - Wrapper for animated sections

- **Animation variants to define:**
  - `fadeInUp` - Entry animation
  - `fadeInDown` - Entry from top
  - `scaleIn` - Scale entrance
  - `slideIn` - Slide transitions
  - `staggerChildren` - Staggered list animations

- **Acceptance Criteria:**
  - Animations match landing page timing and easing
  - Reusable across components
  - Performance optimized (will-change, transform)

---

### Phase 2: Map Route Redesign
**Goal:** Transform MapRoute to match landing page aesthetic

#### Task 2.1: Redesign Map Panel Header
- **File:** `apps/web/src/routes/MapRoute.tsx`
- **Changes:**
  - Replace inline styles with Tailwind classes
  - Use `card-light`/`card-dark` for panel container
  - Update title typography to match landing page
  - Redesign close button with tactile styling
  - Add smooth animations for panel show/hide

- **Acceptance Criteria:**
  - Panel header matches landing page typography
  - Close button uses tactile button styling
  - Smooth slide-in/out animations
  - Dark mode support

#### Task 2.2: Redesign Status & Rank Display
- **File:** `apps/web/src/routes/MapRoute.tsx`
- **Changes:**
  - Convert `.node` sections to `Card` components
  - Use `Badge` component for rank display
  - Apply grounded color palette
  - Add subtle animations for rank updates
  - Improve typography hierarchy

- **Acceptance Criteria:**
  - Rank display uses card styling
  - Colors use grounded palette (copper for highlights)
  - Smooth transitions on data updates
  - Clear visual hierarchy

#### Task 2.3: Redesign Settings Section
- **File:** `apps/web/src/routes/MapRoute.tsx`
- **Changes:**
  - Replace `<details>` with styled accordion component
  - Use `Select` component for map style presets
  - Apply card styling
  - Add icons for visual interest
  - Smooth expand/collapse animations

- **Acceptance Criteria:**
  - Settings in styled card/accordion
  - Map style selector matches theme
  - Smooth animations
  - Icons match landing page style

#### Task 2.4: Redesign Upload Queue
- **File:** `apps/web/src/routes/MapRoute.tsx`
- **Changes:**
  - Convert to card-based layout
  - Use badges for status (uploading, queued, failed)
  - Apply tactile buttons for actions
  - Add progress indicators with animations
  - Improve empty state design

- **Acceptance Criteria:**
  - Upload items in styled cards
  - Status badges use grounded colors
  - Buttons match tactile design
  - Progress animations smooth
  - Empty state matches landing page style

#### Task 2.5: Redesign Node Selection & Check-in
- **File:** `apps/web/src/routes/MapRoute.tsx`
- **Changes:**
  - Convert node info to card layout
  - Redesign buttons with tactile styling
  - Add icons for actions (check-in, directions, capture)
  - Improve check-in status display
  - Add success/error states with animations
  - Use grounded colors for status indicators

- **Acceptance Criteria:**
  - Node info in styled card
  - All buttons use tactile styling
  - Icons match design system
  - Status messages use grounded colors
  - Smooth state transitions

#### Task 2.6: Redesign "Show Panel" Button
- **File:** `apps/web/src/routes/MapRoute.tsx`
- **Changes:**
  - Replace inline styles with tactile button
  - Add icon (hamburger menu)
  - Position with proper spacing
  - Add hover animations
  - Match landing page button style

- **Acceptance Criteria:**
  - Button uses tactile styling
  - Proper icon and spacing
  - Smooth hover effects
  - Matches design system

#### Task 2.7: Update Map Panel Layout
- **Files:**
  - `apps/web/src/routes/MapRoute.tsx`
  - `apps/web/src/styles.css`
- **Changes:**
  - Update `.panel` CSS to use grounded colors
  - Add backdrop blur for depth
  - Improve spacing and padding
  - Add subtle border/shadow
  - Ensure smooth transitions

- **Acceptance Criteria:**
  - Panel uses grounded color palette
  - Backdrop blur for depth
  - Proper spacing matches landing page
  - Smooth show/hide transitions

---

### Phase 3: Node Detail Route Redesign
**Goal:** Match Node Detail page to the new design system

#### Task 3.1: Redesign Node Header
- **File:** `apps/web/src/routes/NodeDetailRoute.tsx`
- **Changes:**
  - Convert to card-based layout
  - Apply landing page typography
  - Add back button with tactile styling
  - Use grounded colors
  - Add smooth entry animations

- **Acceptance Criteria:**
  - Header matches landing page style
  - Typography hierarchy correct
  - Back button uses tactile styling
  - Smooth animations

#### Task 3.2: Redesign Captures Gallery
- **File:** `apps/web/src/routes/NodeDetailRoute.tsx`
- **Changes:**
  - Convert to card grid layout
  - Add hover effects (scale, shadow)
  - Improve image loading states
  - Add attribution display with proper typography
  - Use grounded colors for accents
  - Add smooth grid animations (stagger)

- **Acceptance Criteria:**
  - Gallery uses card grid
  - Hover effects match landing page
  - Attribution clearly displayed
  - Smooth staggered animations
  - Loading states styled

#### Task 3.3: Redesign Report Flow
- **File:** `apps/web/src/routes/NodeDetailRoute.tsx`
- **Changes:**
  - Convert report form to card layout
  - Use `Select` component for reason codes
  - Apply tactile buttons
  - Improve error/success states
  - Add smooth form animations

- **Acceptance Criteria:**
  - Report form in styled card
  - Form inputs match theme
  - Buttons use tactile styling
  - Smooth state transitions
  - Error states use grounded colors

---

### Phase 4: Capture Route Redesign
**Goal:** Match Capture flow to the new design system

#### Task 4.1: Redesign Capture Header
- **File:** `apps/web/src/routes/CaptureRoute.tsx`
- **Changes:**
  - Convert to card layout
  - Apply landing page typography
  - Add back button with tactile styling
  - Use grounded colors
  - Add smooth entry animations

- **Acceptance Criteria:**
  - Header matches design system
  - Typography correct
  - Smooth animations

#### Task 4.2: Update CaptureFlow Component
- **File:** `apps/web/src/features/captures/CaptureFlow.tsx`
- **Changes:**
  - Replace basic buttons with tactile buttons
  - Use card components for sections
  - Apply grounded color palette
  - Add smooth state transitions
  - Improve error/loading states
  - Add progress indicators

- **Acceptance Criteria:**
  - All buttons use tactile styling
  - Cards match design system
  - Smooth state transitions
  - Error states styled
  - Progress indicators animated

---

### Phase 5: CSS Cleanup & Migration
**Goal:** Remove old CSS classes and migrate to Tailwind + design system

#### Task 5.1: Audit and Remove Old CSS
- **Files:**
  - `apps/web/src/styles.css`
  - All route/component files
- **Changes:**
  - Identify all uses of `.node`, `.muted`, `.alert`, `.settings`
  - Replace with new components/utilities
  - Remove unused CSS classes
  - Keep only essential layout CSS (`.layout`, `.map-area`)

- **Acceptance Criteria:**
  - No old CSS classes in use
  - All styling uses Tailwind + design system
  - CSS file cleaned up
  - No visual regressions

#### Task 5.2: Update Layout CSS
- **File:** `apps/web/src/styles.css`
- **Changes:**
  - Update `.layout` to use grounded colors
  - Update `.panel` to match card styling
  - Ensure dark mode support
  - Add smooth transitions

- **Acceptance Criteria:**
  - Layout uses grounded palette
  - Dark mode works correctly
  - Smooth transitions
  - No visual regressions

---

### Phase 6: Polish & Consistency
**Goal:** Ensure consistency across all pages

#### Task 6.1: Add Loading States
- **Files:** All route files
- **Changes:**
  - Create loading skeleton components
  - Match landing page loading style
  - Add smooth fade-in animations
  - Use grounded colors

- **Acceptance Criteria:**
  - Loading states match design system
  - Smooth animations
  - Consistent across pages

#### Task 6.2: Add Empty States
- **Files:** All route files
- **Changes:**
  - Design empty state components
  - Match landing page style
  - Add helpful messaging
  - Use grounded colors and icons

- **Acceptance Criteria:**
  - Empty states match design system
  - Helpful messaging
  - Consistent across pages

#### Task 6.3: Improve Error States
- **Files:** All route files
- **Changes:**
  - Use `Alert` component for errors
  - Apply grounded colors (red variants)
  - Add smooth error animations
  - Improve error messaging

- **Acceptance Criteria:**
  - Error states use Alert component
  - Smooth animations
  - Clear messaging
  - Consistent styling

#### Task 6.4: Add Micro-interactions
- **Files:** All component files
- **Changes:**
  - Add hover effects to all interactive elements
  - Add focus states
  - Add click/tap feedback
  - Ensure smooth transitions

- **Acceptance Criteria:**
  - All interactive elements have feedback
  - Smooth transitions
  - Consistent feel
  - Performance optimized

---

## Design Specifications

### Color Usage
- **Primary Actions:** `grounded-copper` (#D97706)
- **Accents:** `grounded-clay` (#92400E)
- **Backgrounds:** `grounded-parchment` (light) / `grounded-charcoal` (dark)
- **Text:** `grounded-charcoal` / `grounded-parchment` with opacity variants
- **Status:**
  - Success: Green variants (to be defined)
  - Error: Red variants (to be defined)
  - Warning: `grounded-copper` variants
  - Info: `grounded-copper` variants

### Typography Scale
- **Display:** `text-5xl md:text-7xl lg:text-8xl` - Bold, uppercase, wide tracking
- **Section Headings:** `text-4xl md:text-5xl lg:text-6xl` - Bold, uppercase
- **Card Titles:** `text-2xl md:text-3xl` - Bold
- **Body:** `text-base md:text-lg` - Regular weight, relaxed leading
- **Muted:** `text-sm md:text-base` - Reduced opacity (70%)

### Spacing
- **Card Padding:** `p-6 md:p-8 lg:p-10`
- **Section Spacing:** `mb-8 md:mb-12 lg:mb-16`
- **Element Spacing:** `gap-4 md:gap-6`

### Shadows
- **Cards:** `shadow-organic-light` / `shadow-organic-dark`
- **Buttons:** `shadow-tactile-light` / `shadow-tactile-dark`
- **Elevated:** `shadow-glassmorphism`

### Animations
- **Duration:** 0.3s - 0.6s for most transitions
- **Easing:** `ease-out` for entrances, `ease-in-out` for interactions
- **Stagger:** 0.05s - 0.1s delay between items

---

## Implementation Order

### Week 1: Foundation
1. Task 1.1: Create Shared UI Components
2. Task 1.2: Create Typography Utilities
3. Task 1.3: Create Animation Utilities

### Week 2: Map Route
4. Task 2.1: Redesign Map Panel Header
5. Task 2.2: Redesign Status & Rank Display
6. Task 2.3: Redesign Settings Section
7. Task 2.4: Redesign Upload Queue

### Week 3: Map Route (continued) + Node Detail
8. Task 2.5: Redesign Node Selection & Check-in
9. Task 2.6: Redesign "Show Panel" Button
10. Task 2.7: Update Map Panel Layout
11. Task 3.1: Redesign Node Header
12. Task 3.2: Redesign Captures Gallery

### Week 4: Node Detail + Capture + Cleanup
13. Task 3.3: Redesign Report Flow
14. Task 4.1: Redesign Capture Header
15. Task 4.2: Update CaptureFlow Component
16. Task 5.1: Audit and Remove Old CSS
17. Task 5.2: Update Layout CSS

### Week 5: Polish
18. Task 6.1: Add Loading States
19. Task 6.2: Add Empty States
20. Task 6.3: Improve Error States
21. Task 6.4: Add Micro-interactions

---

## Testing Checklist

### Visual Testing
- [ ] All pages match landing page design theme
- [ ] Dark mode works correctly on all pages
- [ ] Responsive design works on mobile/tablet/desktop
- [ ] Animations are smooth and performant
- [ ] Colors match design system
- [ ] Typography hierarchy is consistent

### Functional Testing
- [ ] All buttons work correctly
- [ ] Forms submit properly
- [ ] Navigation works smoothly
- [ ] State transitions work correctly
- [ ] Error states display properly
- [ ] Loading states display properly

### Accessibility Testing
- [ ] Keyboard navigation works
- [ ] Focus states are visible
- [ ] Color contrast meets WCAG standards
- [ ] Screen reader compatibility
- [ ] Touch targets are adequate size

---

## Success Criteria

1. **Visual Consistency:** All pages look cohesive with landing/registration pages
2. **Design System:** All components use shared design tokens
3. **Performance:** Animations are smooth (60fps)
4. **Accessibility:** Meets WCAG 2.1 AA standards
5. **Responsive:** Works on all screen sizes
6. **Dark Mode:** Fully functional across all pages
7. **Code Quality:** Clean, maintainable, reusable components

---

## Notes

- **Incremental Approach:** Implement one page at a time to avoid breaking changes
- **Component Reuse:** Create shared components early to ensure consistency
- **Design Review:** Review each phase with design team/stakeholders
- **Performance:** Monitor animation performance and optimize as needed
- **Accessibility:** Test with screen readers and keyboard navigation throughout

---

*This plan is a living document and should be updated as implementation progresses.*
