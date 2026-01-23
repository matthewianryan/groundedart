# Node Detail Route UI Implementation Strategy

## Overview
This document outlines the implementation strategy for redesigning the Node Detail Route (`NodeDetailRoute.tsx`) to match the design system established in Phases 1-4 of the UI redesign.

## Current State Analysis

### Existing Structure
- **Header**: Basic `<h1>` with node ID
- **Node Info**: Uses `.node`, `.node-header`, `.metadata` CSS classes
- **Captures Gallery**: Basic grid with `.captures-grid` and `.capture-card`
- **Report Flow**: Inline form with basic inputs
- **Empty States**: Simple dashed border boxes
- **Loading States**: Plain text messages
- **Navigation**: Simple text link "Back to map"

### Issues to Address
1. ❌ Uses old CSS classes instead of design system components
2. ❌ No animations or transitions
3. ❌ Generic styling, not matching landing page aesthetic
4. ❌ Missing tactile buttons and card components
5. ❌ No proper loading/error state components
6. ❌ Report form not styled consistently
7. ❌ Captures grid lacks hover effects and animations

---

## Implementation Strategy

### Phase 3.1: Redesign Node Header
**Priority**: High  
**Estimated Time**: 1-2 hours

#### Objectives
- Convert header to card-based layout
- Add back button with tactile styling
- Apply landing page typography
- Add smooth entry animations

#### Implementation Steps

1. **Update Imports**
   ```typescript
   import { motion } from "framer-motion";
   import { Button, Card, Badge } from "../components/ui";
   import { fadeInUp, defaultTransition } from "../utils/animations";
   ```

2. **Redesign Header Section**
   - Wrap header in `Card` component (variant="light", padding="lg")
   - Replace `<h1>` with styled heading using typography classes
   - Add back button using `Button` component (variant="light", size="sm")
   - Include icon (arrow-left) in back button
   - Add `motion.div` wrapper with `fadeInUp` animation

3. **Node Information Card**
   - Create separate `Card` for node details
   - Use `Badge` component for category/type
   - Apply proper typography hierarchy
   - Style metadata grid with grounded colors

4. **Locked Node State**
   - Use `Alert` component (variant="warning")
   - Display rank requirements clearly
   - Add visual hierarchy

#### Acceptance Criteria
- [ ] Header uses Card component
- [ ] Back button uses tactile styling with icon
- [ ] Typography matches landing page
- [ ] Smooth fade-in animation on load
- [ ] Dark mode support

---

### Phase 3.2: Redesign Captures Gallery
**Priority**: High  
**Estimated Time**: 2-3 hours

#### Objectives
- Convert to card grid layout with hover effects
- Add smooth staggered animations
- Improve image loading states
- Enhance attribution display

#### Implementation Steps

1. **Gallery Container**
   - Wrap gallery in `motion.div` with `staggerContainer` variant
   - Use responsive grid: `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4`

2. **Capture Cards**
   - Each capture in `Card` component (variant="light", padding="none", hover={true})
   - Add `motion.div` wrapper with `staggerItem` variant
   - Implement hover effects: scale(1.02), translateY(-4px)
   - Add shadow transitions

3. **Image Display**
   - Use `motion.img` for smooth image loading
   - Add loading skeleton/placeholder
   - Implement lazy loading with fade-in
   - Handle missing images with styled fallback

4. **Attribution Display**
   - Create attribution section with proper typography
   - Use muted text for secondary info
   - Add source link styling
   - Display in card footer area

5. **Empty States**
   - Use `Card` component for empty state
   - Add icon (image/gallery icon)
   - Style with grounded colors
   - Add helpful messaging

6. **Loading States**
   - Create skeleton cards with shimmer effect
   - Use `Card` component with loading animation
   - Match number of skeletons to expected grid size

#### Acceptance Criteria
- [ ] Gallery uses responsive card grid
- [ ] Hover effects match landing page (scale + shadow)
- [ ] Smooth staggered animations on load
- [ ] Attribution clearly displayed with proper typography
- [ ] Loading states use skeleton cards
- [ ] Empty states styled consistently

---

### Phase 3.3: Redesign Report Flow
**Priority**: Medium  
**Estimated Time**: 1-2 hours

#### Objectives
- Convert report form to card layout
- Use design system components
- Improve error/success states
- Add smooth form animations

#### Implementation Steps

1. **Report Button**
   - Replace basic button with `Button` component
   - Use variant="light" or "copper" based on context
   - Add icon (flag/alert icon)
   - Position within capture card

2. **Report Form Card**
   - Wrap form in `Card` component (variant="light", padding="lg")
   - Use `AnimatePresence` for show/hide animation
   - Add slide-in animation from capture card

3. **Form Inputs**
   - Replace `<select>` with `Select` component
   - Replace `<textarea>` with styled textarea (or create Textarea component)
   - Apply proper labels and spacing
   - Use grounded color palette

4. **Form Actions**
   - Use `Button` components for Submit/Cancel
   - Submit button: variant="copper", size="md"
   - Cancel button: variant="light", size="md"
   - Add loading state to submit button

5. **Error/Success States**
   - Use `Alert` component for errors (variant="error")
   - Show success message after submission
   - Add smooth transitions between states

6. **Reported State**
   - Show `Badge` component (variant="success") when reported
   - Disable report button after submission
   - Add visual feedback

#### Acceptance Criteria
- [ ] Report form in styled card
- [ ] Form inputs match design system
- [ ] Buttons use tactile styling
- [ ] Smooth state transitions
- [ ] Error states use Alert component
- [ ] Success feedback clearly displayed

---

## Additional Enhancements

### Metadata Display
- Convert `.metadata` grid to styled card section
- Use `Badge` components for values
- Apply proper spacing and typography
- Add icons for location data

### Rank Display
- Use `Badge` component for rank display
- Color-code based on rank status (copper for unlocked, muted for locked)
- Add visual hierarchy

### Tip Flow Integration
- Ensure TipFlow component matches design system
- Wrap in `Card` component if needed
- Apply consistent spacing

### Responsive Design
- Ensure mobile-friendly layout
- Test grid responsiveness
- Verify touch targets are adequate
- Check animations on mobile

---

## File Structure

### Files to Modify
- `apps/web/src/routes/NodeDetailRoute.tsx` - Main component
- `apps/web/src/styles.css` - Remove old CSS classes (in Phase 5)

### Components to Use
- `Button` - All buttons
- `Card` - Sections and capture cards
- `Badge` - Status indicators, categories, ranks
- `Alert` - Error messages, empty states
- `Select` - Report reason dropdown
- `Input` - If textarea component is created
- `AnimatedSection` - Optional wrapper for sections

### Utilities to Use
- `fadeInUp` - Entry animations
- `staggerContainer` - Gallery container
- `staggerItem` - Individual capture cards
- `scaleIn` - Image loading
- `defaultTransition` - Standard transitions

---

## Implementation Order

### Step 1: Setup & Header (30 min)
1. Update imports
2. Redesign header with Card and Button
3. Add animations
4. Test header appearance

### Step 2: Node Information (45 min)
1. Convert node info to Card layout
2. Style metadata grid
3. Add Badge for category
4. Handle locked node state
5. Test all node states

### Step 3: Captures Gallery (90 min)
1. Convert grid to Card-based layout
2. Add hover effects
3. Implement staggered animations
4. Style attribution display
5. Add loading/empty states
6. Test gallery interactions

### Step 4: Report Flow (60 min)
1. Style report button
2. Convert form to Card
3. Replace inputs with components
4. Add error/success states
5. Test form submission flow

### Step 5: Polish & Testing (30 min)
1. Review all states (loading, error, empty, success)
2. Test animations
3. Verify dark mode
4. Check responsive design
5. Fix any visual inconsistencies

---

## Testing Checklist

### Visual Testing
- [ ] Header matches landing page style
- [ ] Typography hierarchy correct
- [ ] Colors use grounded palette
- [ ] Dark mode works correctly
- [ ] Animations are smooth (60fps)
- [ ] Hover effects work properly

### Functional Testing
- [ ] Back button navigates correctly
- [ ] Captures load and display properly
- [ ] Report form submits successfully
- [ ] Error states display correctly
- [ ] Loading states show appropriately
- [ ] Empty states display when no captures

### Responsive Testing
- [ ] Mobile layout works (grid adapts)
- [ ] Touch targets are adequate
- [ ] Animations work on mobile
- [ ] Text is readable on small screens

### Accessibility Testing
- [ ] Keyboard navigation works
- [ ] Focus states are visible
- [ ] Screen reader compatibility
- [ ] Color contrast meets WCAG standards

---

## Success Metrics

1. **Visual Consistency**: Matches landing page design system
2. **Component Reuse**: Uses shared UI components
3. **Performance**: Animations run at 60fps
4. **Accessibility**: Meets WCAG 2.1 AA standards
5. **Code Quality**: Clean, maintainable, follows patterns from Phase 4

---

## Notes

- Follow the same patterns established in Phase 4 (Capture Route)
- Reuse components from `apps/web/src/components/ui`
- Maintain consistency with MapRoute styling
- Test thoroughly before marking tasks complete
- Update `UI_REDESIGN_TASKS.md` as you complete each task

---

*This strategy should be updated as implementation progresses and new insights are discovered.*
