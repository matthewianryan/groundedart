# Node Detail Route - Quick Task Breakdown

## Task 3.1: Redesign Node Header
**File**: `apps/web/src/routes/NodeDetailRoute.tsx`  
**Time Estimate**: 1-2 hours

### Subtasks
1. [ ] Add imports: `motion`, `Button`, `Card`, `Badge`, `fadeInUp`, `defaultTransition`
2. [ ] Replace header section with `Card` component
3. [ ] Style heading with typography classes (`text-3xl`, `font-bold`, `uppercase`, `tracking-tight`)
4. [ ] Add back button with `Button` component and arrow icon
5. [ ] Wrap in `motion.div` with `fadeInUp` animation
6. [ ] Convert node info section to `Card` layout
7. [ ] Add `Badge` for category/type display
8. [ ] Style metadata grid with grounded colors
9. [ ] Handle locked node state with `Alert` component
10. [ ] Test dark mode support

### Code Snippets Reference
```tsx
// Header structure
<Card variant="light" padding="lg">
  <div className="flex items-center justify-between mb-4">
    <div>
      <h1 className="text-3xl md:text-4xl font-bold uppercase...">
        Node Detail
      </h1>
      <div className="text-sm text-grounded-charcoal/70...">
        Node ID: {nodeId}
      </div>
    </div>
    <Button variant="light" size="sm" onClick={() => navigate("/map")}>
      <svg>...</svg> Back
    </Button>
  </div>
</Card>
```

---

## Task 3.2: Redesign Captures Gallery
**File**: `apps/web/src/routes/NodeDetailRoute.tsx`  
**Time Estimate**: 2-3 hours

### Subtasks
1. [ ] Wrap gallery in `motion.div` with `staggerContainer`
2. [ ] Update grid to use Tailwind: `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4`
3. [ ] Convert each capture to `Card` component (hover={true})
4. [ ] Add `motion.div` wrapper with `staggerItem` for each capture
5. [ ] Implement image with `motion.img` and fade-in animation
6. [ ] Style attribution section with proper typography
7. [ ] Add source link styling
8. [ ] Create empty state with `Card` and icon
9. [ ] Create loading skeleton cards
10. [ ] Add error state with `Alert` component
11. [ ] Test hover effects (scale + shadow)
12. [ ] Verify staggered animations

### Code Snippets Reference
```tsx
// Gallery structure
<motion.div variants={staggerContainer} initial="initial" animate="animate">
  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
    {captures.map((capture, index) => (
      <motion.div
        key={capture.id}
        variants={staggerItem}
        transition={{ ...defaultTransition, delay: index * 0.05 }}
      >
        <Card variant="light" padding="none" hover={true}>
          <motion.img
            src={capture.image_url}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full aspect-square object-cover rounded-t-lg"
          />
          <div className="p-4">
            {/* Attribution */}
          </div>
        </Card>
      </motion.div>
    ))}
  </div>
</motion.div>
```

---

## Task 3.3: Redesign Report Flow
**File**: `apps/web/src/routes/NodeDetailRoute.tsx`  
**Time Estimate**: 1-2 hours

### Subtasks
1. [ ] Replace report button with `Button` component
2. [ ] Add flag/alert icon to report button
3. [ ] Wrap report form in `Card` component
4. [ ] Use `AnimatePresence` for form show/hide
5. [ ] Replace `<select>` with `Select` component
6. [ ] Style textarea with grounded colors
7. [ ] Replace form buttons with `Button` components
8. [ ] Add loading state to submit button
9. [ ] Use `Alert` component for errors
10. [ ] Show success state with `Badge` or `Alert`
11. [ ] Add smooth transitions between states
12. [ ] Test form submission flow

### Code Snippets Reference
```tsx
// Report button
<Button
  variant="light"
  size="sm"
  onClick={() => startReport(capture.id)}
  className="flex items-center gap-2"
>
  <svg>...</svg> Report
</Button>

// Report form
<AnimatePresence>
  {reportingCaptureId === capture.id && (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
    >
      <Card variant="light" padding="md" className="mt-4">
        <Select
          label="Reason"
          value={reportReason}
          onChange={(e) => setReportReason(e.target.value)}
          options={reportReasons.map(r => ({ value: r, label: r.replace(/_/g, " ") }))}
        />
        {/* Textarea and buttons */}
      </Card>
    </motion.div>
  )}
</AnimatePresence>
```

---

## Quick Reference: Component Mapping

| Old Element | New Component | Notes |
|------------|---------------|-------|
| `<h1>` | Typography classes | `text-3xl font-bold uppercase` |
| `<button>` | `Button` | Use appropriate variant |
| `.node` | `Card` | variant="light", padding="lg" |
| `.capture-card` | `Card` | hover={true} for effects |
| `.alert` | `Alert` | Use appropriate variant |
| `<select>` | `Select` | With options array |
| `.empty-state` | `Card` + icon | Styled consistently |
| Plain text link | `Button` or `Link` | With proper styling |

---

## Testing Quick Checklist

### Before Marking Complete
- [ ] All buttons use `Button` component
- [ ] All sections use `Card` component
- [ ] Animations are smooth (check performance)
- [ ] Dark mode works correctly
- [ ] Mobile responsive
- [ ] No console errors
- [ ] All states tested (loading, error, empty, success)
- [ ] Typography matches landing page
- [ ] Colors use grounded palette

---

## Common Patterns to Follow

### Card Layout Pattern
```tsx
<Card variant="light" padding="lg" className="mb-6">
  <h2 className="text-xl font-bold uppercase tracking-wide mb-4">
    Section Title
  </h2>
  {/* Content */}
</Card>
```

### Animation Pattern
```tsx
<motion.div
  initial="initial"
  animate="animate"
  variants={fadeInUp}
  transition={defaultTransition}
>
  {/* Content */}
</motion.div>
```

### Button Pattern
```tsx
<Button
  variant="copper" // or "light" or "dark"
  size="md" // or "sm" or "lg"
  onClick={handler}
  className="flex items-center gap-2"
>
  <Icon /> Action
</Button>
```

---

*Use this as a quick reference while implementing. See `NODE_DETAIL_UI_STRATEGY.md` for detailed strategy.*
