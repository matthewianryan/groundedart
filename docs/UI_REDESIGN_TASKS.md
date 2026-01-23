# UI Redesign Tasks

This file tracks the implementation progress of the UI redesign plan. See `docs/UI_REDESIGN_PLAN.md` for detailed specifications.

## Phase 1: Design System Foundation

### Task 1.1: Create Shared UI Components
- **Status:** ⏳ Pending
- **Files:**
  - `apps/web/src/components/ui/Button.tsx`
  - `apps/web/src/components/ui/Card.tsx`
  - `apps/web/src/components/ui/Badge.tsx`
  - `apps/web/src/components/ui/Panel.tsx`
  - `apps/web/src/components/ui/Input.tsx`
  - `apps/web/src/components/ui/Select.tsx`
  - `apps/web/src/components/ui/Alert.tsx`
  - `apps/web/src/components/ui/index.ts`
- **Acceptance Criteria:**
  - [ ] Components use `card-light`/`card-dark` and `btn-tactile-*` classes
  - [ ] Support dark mode via `dark:` variants
  - [ ] Include hover/focus states with animations
  - [ ] Match typography and spacing from landing page
  - [ ] Export from index.ts

### Task 1.2: Create Typography Utilities
- **Status:** ⏳ Pending
- **Files:**
  - `apps/web/src/styles/typography.css` (or add to styles.css)
- **Acceptance Criteria:**
  - [ ] Typography matches landing page hierarchy
  - [ ] Proper font weights, sizes, and tracking
  - [ ] Dark mode variants included

### Task 1.3: Create Animation Utilities
- **Status:** ⏳ Pending
- **Files:**
  - `apps/web/src/utils/animations.ts`
  - `apps/web/src/components/ui/AnimatedSection.tsx`
- **Acceptance Criteria:**
  - [ ] Animations match landing page timing and easing
  - [ ] Reusable across components
  - [ ] Performance optimized

---

## Phase 2: Map Route Redesign

### Task 2.1: Redesign Map Panel Header
- **Status:** ⏳ Pending
- **File:** `apps/web/src/routes/MapRoute.tsx`
- **Acceptance Criteria:**
  - [ ] Panel header matches landing page typography
  - [ ] Close button uses tactile button styling
  - [ ] Smooth slide-in/out animations
  - [ ] Dark mode support

### Task 2.2: Redesign Status & Rank Display
- **Status:** ⏳ Pending
- **File:** `apps/web/src/routes/MapRoute.tsx`
- **Acceptance Criteria:**
  - [ ] Rank display uses card styling
  - [ ] Colors use grounded palette (copper for highlights)
  - [ ] Smooth transitions on data updates
  - [ ] Clear visual hierarchy

### Task 2.3: Redesign Settings Section
- **Status:** ⏳ Pending
- **File:** `apps/web/src/routes/MapRoute.tsx`
- **Acceptance Criteria:**
  - [ ] Settings in styled card/accordion
  - [ ] Map style selector matches theme
  - [ ] Smooth animations
  - [ ] Icons match landing page style

### Task 2.4: Redesign Upload Queue
- **Status:** ⏳ Pending
- **File:** `apps/web/src/routes/MapRoute.tsx`
- **Acceptance Criteria:**
  - [ ] Upload items in styled cards
  - [ ] Status badges use grounded colors
  - [ ] Buttons match tactile design
  - [ ] Progress animations smooth
  - [ ] Empty state matches landing page style

### Task 2.5: Redesign Node Selection & Check-in
- **Status:** ⏳ Pending
- **File:** `apps/web/src/routes/MapRoute.tsx`
- **Acceptance Criteria:**
  - [ ] Node info in styled card
  - [ ] All buttons use tactile styling
  - [ ] Icons match design system
  - [ ] Status messages use grounded colors
  - [ ] Smooth state transitions

### Task 2.6: Redesign "Show Panel" Button
- **Status:** ⏳ Pending
- **File:** `apps/web/src/routes/MapRoute.tsx`
- **Acceptance Criteria:**
  - [ ] Button uses tactile styling
  - [ ] Proper icon and spacing
  - [ ] Smooth hover effects
  - [ ] Matches design system

### Task 2.7: Update Map Panel Layout
- **Status:** ⏳ Pending
- **Files:**
  - `apps/web/src/routes/MapRoute.tsx`
  - `apps/web/src/styles.css`
- **Acceptance Criteria:**
  - [ ] Panel uses grounded color palette
  - [ ] Backdrop blur for depth
  - [ ] Proper spacing matches landing page
  - [ ] Smooth show/hide transitions

---

## Phase 3: Node Detail Route Redesign

### Task 3.1: Redesign Node Header
- **Status:** ⏳ Pending
- **File:** `apps/web/src/routes/NodeDetailRoute.tsx`
- **Acceptance Criteria:**
  - [ ] Header matches landing page style
  - [ ] Typography hierarchy correct
  - [ ] Back button uses tactile styling
  - [ ] Smooth animations

### Task 3.2: Redesign Captures Gallery
- **Status:** ⏳ Pending
- **File:** `apps/web/src/routes/NodeDetailRoute.tsx`
- **Acceptance Criteria:**
  - [ ] Gallery uses card grid
  - [ ] Hover effects match landing page
  - [ ] Attribution clearly displayed
  - [ ] Smooth staggered animations
  - [ ] Loading states styled

### Task 3.3: Redesign Report Flow
- **Status:** ⏳ Pending
- **File:** `apps/web/src/routes/NodeDetailRoute.tsx`
- **Acceptance Criteria:**
  - [ ] Report form in styled card
  - [ ] Form inputs match theme
  - [ ] Buttons use tactile styling
  - [ ] Smooth state transitions
  - [ ] Error states use grounded colors

---

## Phase 4: Capture Route Redesign

### Task 4.1: Redesign Capture Header
- **Status:** ⏳ Pending
- **File:** `apps/web/src/routes/CaptureRoute.tsx`
- **Acceptance Criteria:**
  - [ ] Header matches design system
  - [ ] Typography correct
  - [ ] Smooth animations

### Task 4.2: Update CaptureFlow Component
- **Status:** ⏳ Pending
- **File:** `apps/web/src/features/captures/CaptureFlow.tsx`
- **Acceptance Criteria:**
  - [ ] All buttons use tactile styling
  - [ ] Cards match design system
  - [ ] Smooth state transitions
  - [ ] Error states styled
  - [ ] Progress indicators animated

---

## Phase 5: CSS Cleanup & Migration

### Task 5.1: Audit and Remove Old CSS
- **Status:** ⏳ Pending
- **Files:**
  - `apps/web/src/styles.css`
  - All route/component files
- **Acceptance Criteria:**
  - [ ] No old CSS classes in use
  - [ ] All styling uses Tailwind + design system
  - [ ] CSS file cleaned up
  - [ ] No visual regressions

### Task 5.2: Update Layout CSS
- **Status:** ⏳ Pending
- **File:** `apps/web/src/styles.css`
- **Acceptance Criteria:**
  - [ ] Layout uses grounded palette
  - [ ] Dark mode works correctly
  - [ ] Smooth transitions
  - [ ] No visual regressions

---

## Phase 6: Polish & Consistency

### Task 6.1: Add Loading States
- **Status:** ⏳ Pending
- **Files:** All route files
- **Acceptance Criteria:**
  - [ ] Loading states match design system
  - [ ] Smooth animations
  - [ ] Consistent across pages

### Task 6.2: Add Empty States
- **Status:** ⏳ Pending
- **Files:** All route files
- **Acceptance Criteria:**
  - [ ] Empty states match design system
  - [ ] Helpful messaging
  - [ ] Consistent across pages

### Task 6.3: Improve Error States
- **Status:** ⏳ Pending
- **Files:** All route files
- **Acceptance Criteria:**
  - [ ] Error states use Alert component
  - [ ] Smooth animations
  - [ ] Clear messaging
  - [ ] Consistent styling

### Task 6.4: Add Micro-interactions
- **Status:** ⏳ Pending
- **Files:** All component files
- **Acceptance Criteria:**
  - [ ] All interactive elements have feedback
  - [ ] Smooth transitions
  - [ ] Consistent feel
  - [ ] Performance optimized

---

## Progress Summary

- **Total Tasks:** 21
- **Completed:** 0
- **In Progress:** 0
- **Pending:** 21

## Status Legend
- ⏳ Pending
- 🔄 In Progress
- ✅ Completed
- ❌ Blocked
- 🔍 Review Needed

---

*Update this file as you complete tasks. Mark tasks as "In Progress" when you start working on them.*
