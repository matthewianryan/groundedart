# Teammate Work Summary - Code Analysis

This document summarizes the code changes, implementations, and pages created by your teammate based on the documentation and codebase analysis.

## 📄 Pages & Routes Created

### 1. **Landing Page (`/`)** - `apps/web/src/pages/Home.tsx`
- **Purpose**: Main landing page with hero section and artwork gallery
- **Features**:
  - Hero section with "GROUNDED ART COLLECTIONS" title (clickable, navigates to `/register`)
  - Scroll-triggered animations using Framer Motion
  - Multiple scroll grid sections with different animation types:
    - "Rawness" section (staggered-drop animation)
    - "Vision/Focus/Essence" section (center-stagger animation)
    - "Craft/Perspective" section (rotation-fade animation)
    - 3D transform grid section
  - About section explaining the collection
  - "Looking Ahead" future vision section
  - Smooth scroll-based fade effects on hero content
  - Scroll indicator animation

### 2. **Registration Page (`/register`)** - `apps/web/src/pages/Register.tsx`
- **Purpose**: User registration/onboarding flow
- **Status**: Created but implementation details not fully visible in docs
- **Integration**: Connected to landing page navigation flow

### 3. **Map Route (`/map`)** - `apps/web/src/routes/MapRoute.tsx`
- **Purpose**: Main interactive map interface for discovering art nodes
- **Features**:
  - Google Maps integration with viewport-based node fetching
  - Left control panel with:
    - Application status
    - User rank display and unlock information
    - Global settings (map style presets)
    - Upload queue management (pending/failed uploads)
    - Node selection and check-in functionality
    - Check-in status and accuracy/distance display
    - Capture creation flow
  - Node markers on map (red pins)
  - Directions integration
  - User location marker
  - Panel toggle functionality (can hide/show)
  - Rank-based node visibility gating
  - Online/offline state handling

### 4. **Node Detail Route (`/nodes/:nodeId`)** - `apps/web/src/routes/NodeDetailRoute.tsx`
- **Purpose**: Detailed view of a specific art node
- **Features**:
  - Node metadata display
  - Verified captures gallery
  - Rank gating information
  - Navigation back to map

### 5. **Capture Route (`/capture/:captureId?`)** - `apps/web/src/routes/CaptureRoute.tsx`
- **Purpose**: Camera capture and upload flow
- **Features**:
  - Camera-first capture interface
  - Image preprocessing (resize, compression)
  - Preview and retake functionality
  - Upload with retry logic
  - Integration with check-in tokens

## 🎨 UI Components Created

### Layout & Theme
- **Layout Component** (`apps/web/src/components/Layout.tsx`):
  - Wraps all routes
  - 3D background (ArtworkRing) for landing/registration pages
  - Theme toggle integration
  - Rotation controls for 3D background
  - Scroll-responsive animations

- **Theme Toggle** (`apps/web/src/components/ThemeToggle.tsx`):
  - Dark/light mode switching
  - Persistent theme preference

- **Theme Provider** (`apps/web/src/components/ThemeProvider.tsx`):
  - Theme context management

### 3D Background Components
- **ArtworkRing** (`apps/web/src/components/ArtworkRing.tsx`):
  - 3D rotating carousel of artwork cards
  - Used as animated background on landing/registration pages

- **ArtworkPlane** (`apps/web/src/components/ArtworkPlane.tsx`):
  - Individual artwork card rendering in 3D space

- **ArtworkScene** (`apps/web/src/components/ArtworkScene.tsx`):
  - Three.js scene setup for 3D artwork display

- **RotationControls** (`apps/web/src/components/RotationControls.tsx`):
  - UI controls for adjusting 3D background rotation, position, speed

## 🏗️ Architecture & Implementation Decisions

### Frontend Stack
- **Framework**: React + TypeScript + Vite
- **Routing**: React Router v6
- **Animations**: Framer Motion
- **3D Graphics**: Three.js (for landing page background)
- **Maps**: Google Maps JS API via `@react-google-maps/api`
- **State Management**: React hooks (useState, useEffect, useMemo)

### Key Design Patterns
1. **Layout Wrapper Pattern**: All routes wrapped in Layout component for consistent 3D background and theme
2. **Route-based Conditional Rendering**: 3D background only shows on `/` and `/register` routes
3. **Scroll-triggered Animations**: Hero content fades based on scroll position
4. **Component Composition**: Modular components for artwork display, controls, etc.

### Styling Approach
- **Tailwind CSS** for utility classes
- **Custom CSS** in `styles.css` for layout-specific styles (`.layout`, `.panel`, `.map-area`)
- **Dark mode support** via theme provider
- **Responsive design** with mobile breakpoints

## 📊 Milestone Implementation Status

### ✅ Milestone 0 (Demoable Discovery) - COMPLETE
- Google Maps integration
- Node read API with viewport queries
- Node detail view
- Anonymous session management

### ✅ Milestone 1 (On-site Check-in) - COMPLETE
- Geofence model (point + radius)
- Server-side check-in flow (challenge → verify → token)
- GPS accuracy handling
- Check-in token gating for captures

### ✅ Milestone 2 (Capture + Upload) - COMPLETE
- Camera capture flow
- Client-side image preprocessing (resize/compress)
- Resilient upload queue with IndexedDB persistence
- Retry logic with exponential backoff
- API-terminated storage (local dev)

### ✅ Milestone 3 (Verification State Machine) - COMPLETE
- Capture states: `draft → pending_verification → verified/rejected/hidden`
- Server-enforced state transitions
- Audit log (capture_events table)
- Basic anti-abuse (rate limits, caps)
- Admin moderation endpoints
- Async verification hook boundary (no-op by default)

### ✅ Milestone 4 (Rank + Gating) - COMPLETE
- Rank computation from verified captures only
- Rank event log (append-only, idempotent)
- API-level gating on read/write paths
- `/v1/me` endpoint with rank breakdown
- UX explaining rank unlocks and gating

### 🚧 Milestone 5 (Attribution + Rights) - PLANNED
- Tasks defined in `docs/TASKS.md` but not yet implemented
- Visibility policy, attribution fields, consent enforcement
- Reporting/takedown primitives

### 🚧 Milestone 6 (Observability) - PLANNED
- Structured logs, metrics, tracing
- Not yet implemented

## 🔑 Key Features Implemented

### 1. **Landing Page Experience**
- Beautiful scroll-triggered artwork gallery
- Multiple animation types for visual interest
- Smooth transitions and fade effects
- Clickable hero title that navigates to registration

### 2. **3D Background System**
- Rotating 3D carousel of artwork cards
- Interactive controls for rotation, position, speed
- Only visible on landing/registration pages
- Scroll-responsive opacity and blur effects

### 3. **Map Interface**
- Full Google Maps integration
- Viewport-based node fetching
- Rank-gated node visibility
- Check-in flow with GPS verification
- Upload queue management
- Panel toggle for full-screen map view

### 4. **Capture Flow**
- Camera-first capture interface
- Image preprocessing (max 1600px, 1.5MB)
- Preview and retake
- Resilient upload with retry logic
- IndexedDB persistence for upload intents

### 5. **Rank & Gating System**
- Rank computed from verified captures
- Per-node and per-day caps
- API-enforced gating on discovery and actions
- Clear UX explaining unlocks and requirements

## 📁 File Structure Created

```
apps/web/src/
├── pages/
│   ├── Home.tsx              # Landing page
│   └── Register.tsx           # Registration page
├── routes/
│   ├── MapRoute.tsx           # Main map interface
│   ├── NodeDetailRoute.tsx    # Node detail view
│   └── CaptureRoute.tsx      # Capture flow
├── components/
│   ├── Layout.tsx             # App layout wrapper
│   ├── ThemeToggle.tsx        # Dark/light mode
│   ├── ThemeProvider.tsx      # Theme context
│   ├── ArtworkRing.tsx        # 3D carousel
│   ├── ArtworkPlane.tsx       # 3D card component
│   ├── ArtworkScene.tsx       # Three.js scene
│   └── RotationControls.tsx   # 3D controls
├── features/
│   ├── captures/              # Capture flow logic
│   ├── checkin/               # Check-in API client
│   ├── me/                    # User rank/me API
│   └── nodes/                 # Node API client
└── styles.css                 # Custom styles
```

## 🎯 Current State & Known Issues

### Working Features
- ✅ Landing page with animations
- ✅ Registration page navigation
- ✅ Map with node discovery
- ✅ Check-in flow
- ✅ Capture and upload
- ✅ Rank system and gating
- ✅ Verification state machine
- ✅ Panel toggle on map

### Known Issues (from docs)
- **Nodes not loading**: Documented in `docs/TOADDRESS.md` as a consistent bug
- **Layout height issue**: Fixed in recent changes (map route now uses full viewport height)
- **Panel blocking screen**: Fixed with toggle functionality

### Areas Needing Attention
1. **Attribution & Rights** (Milestone 5): Tasks defined but not implemented
2. **Observability** (Milestone 6): Not yet started
3. **Media Storage**: Still using local dev storage, needs object storage for production
4. **Verification Pipeline**: Async jobs/workers not yet implemented (hook boundary exists but is no-op)

## 🔄 Integration Points

### Between Landing & Map
- Landing page hero title navigates to `/register`
- Registration flow likely connects to `/map` after completion
- Layout component conditionally shows 3D background only on landing/registration

### Between Map & Capture
- Map route provides check-in token and node context
- Capture route consumes check-in token for capture creation
- Upload queue managed in MapRoute shows pending/failed uploads

### API Integration
- All routes use shared API client (`apps/web/src/api/http.ts`)
- Session management via cookies
- Error handling with standardized error codes
- Rank gating enforced server-side

## 📝 Documentation Quality

Your teammate has created **excellent documentation**:
- Clear milestone breakdowns (M0-M4)
- Implementation records for each milestone
- Task tracking in `TASKS.md`
- Architecture decisions documented
- Roadmap with dependencies clearly defined

## 🚀 Next Steps (Based on Roadmap)

1. **Complete Milestone 5**: Attribution and rights enforcement
2. **Implement Observability**: Logs, metrics, tracing
3. **Upgrade Media Storage**: Move from local to object storage
4. **Fix Node Loading Bug**: Address the documented issue
5. **Enhance Verification Pipeline**: Implement async scoring/jobs

---

*This summary is based on analysis of documentation in `docs/` and codebase structure. For specific implementation details, refer to the milestone docs (M0.md through M4.md) and the code itself.*
