# UI Redesign Tasks

This file tracks the implementation progress of the UI redesign plan. See `docs/UI_REDESIGN_PLAN.md` for detailed specifications.

## Phase 1: Design System Foundation

### Task 1.1: Create Shared UI Components
- **Status:** ✅ Completed
- **Files:**
  - `apps/web/src/components/ui/Button.tsx`
  - `apps/web/src/components/ui/Card.tsx`
  - `apps/web/src/components/ui/Badge.tsx`
  - `apps/web/src/components/ui/Panel.tsx`
  - `apps/web/src/components/ui/Input.tsx`
  - `apps/web/src/components/ui/Select.tsx`
  - `apps/web/src/components/ui/Alert.tsx`
  - `apps/web/src/components/ui/AnimatedSection.tsx`
  - `apps/web/src/components/ui/index.ts`
- **Acceptance Criteria:**
  - [x] Components use `card-light`/`card-dark` and `btn-tactile-*` classes
  - [x] Support dark mode via `dark:` variants
  - [x] Include hover/focus states with animations
  - [x] Match typography and spacing from landing page
  - [x] Export from index.ts

### Task 1.2: Create Typography Utilities
- **Status:** ✅ Completed
- **Files:**
  - `apps/web/src/styles.css` (added typography utilities)
- **Acceptance Criteria:**
  - [x] Typography matches landing page hierarchy
  - [x] Proper font weights, sizes, and tracking
  - [x] Dark mode variants included

### Task 1.3: Create Animation Utilities
- **Status:** ✅ Completed
- **Files:**
  - `apps/web/src/utils/animations.ts`
  - `apps/web/src/components/ui/AnimatedSection.tsx`
- **Acceptance Criteria:**
  - [x] Animations match landing page timing and easing
  - [x] Reusable across components
  - [x] Performance optimized

---

## Phase 2: Map Route Redesign

### Task 2.1: Redesign Map Panel Header
- **Status:** ✅ Completed
- **File:** `apps/web/src/routes/MapRoute.tsx`
- **Acceptance Criteria:**
  - [x] Panel header matches landing page typography
  - [x] Close button uses tactile button styling
  - [x] Smooth slide-in/out animations
  - [x] Dark mode support

### Task 2.2: Redesign Status & Rank Display
- **Status:** ✅ Completed
- **File:** `apps/web/src/routes/MapRoute.tsx`
- **Acceptance Criteria:**
  - [x] Rank display uses card styling
  - [x] Colors use grounded palette (copper for highlights)
  - [x] Smooth transitions on data updates
  - [x] Clear visual hierarchy

### Task 2.3: Redesign Settings Section
- **Status:** ✅ Completed
- **File:** `apps/web/src/routes/MapRoute.tsx`
- **Acceptance Criteria:**
  - [x] Settings in styled card/accordion
  - [x] Map style selector matches theme
  - [x] Smooth animations
  - [x] Icons match landing page style

### Task 2.4: Redesign Upload Queue
- **Status:** ✅ Completed
- **File:** `apps/web/src/routes/MapRoute.tsx`
- **Acceptance Criteria:**
  - [x] Upload items in styled cards
  - [x] Status badges use grounded colors
  - [x] Buttons match tactile design
  - [x] Progress animations smooth
  - [x] Empty state matches landing page style

### Task 2.5: Redesign Node Selection & Check-in
- **Status:** ✅ Completed
- **File:** `apps/web/src/routes/MapRoute.tsx`
- **Acceptance Criteria:**
  - [x] Node info in styled card
  - [x] All buttons use tactile styling
  - [x] Icons match design system
  - [x] Status messages use grounded colors
  - [x] Smooth state transitions

### Task 2.6: Redesign "Show Panel" Button
- **Status:** ✅ Completed
- **File:** `apps/web/src/routes/MapRoute.tsx`
- **Acceptance Criteria:**
  - [x] Button uses tactile styling
  - [x] Proper icon and spacing
  - [x] Smooth hover effects
  - [x] Matches design system

### Task 2.7: Update Map Panel Layout
- **Status:** ✅ Completed
- **Files:**
  - `apps/web/src/routes/MapRoute.tsx`
  - `apps/web/src/styles.css`
- **Acceptance Criteria:**
  - [x] Panel uses grounded color palette
  - [x] Backdrop blur for depth
  - [x] Proper spacing matches landing page
  - [x] Smooth show/hide transitions

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
- **Status:** ✅ Completed
- **File:** `apps/web/src/routes/CaptureRoute.tsx`
- **Acceptance Criteria:**
  - [x] Header matches design system
  - [x] Typography correct
  - [x] Smooth animations

### Task 4.2: Update CaptureFlow Component
- **Status:** ✅ Completed
- **File:** `apps/web/src/features/captures/CaptureFlow.tsx`
- **Acceptance Criteria:**
  - [x] All buttons use tactile styling
  - [x] Cards match design system
  - [x] Smooth state transitions
  - [x] Error states styled
  - [x] Progress indicators animated

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
- **Completed:** 12
- **In Progress:** 0
- **Pending:** 9

## Status Legend
- ⏳ Pending
- 🔄 In Progress
- ✅ Completed
- ❌ Blocked
- 🔍 Review Needed

---

*Update this file as you complete tasks. Mark tasks as "In Progress" when you start working on them.*
