# Learning Log

A record of technical decisions, challenges, root-cause analyses, and lessons learned while architecting and building the **RCD Status Map** dashboard.

---

## Phase 1: Foundations & Architecture

### What Was Built
- Transitioned a monolithic ~9.4MB single-file HTML prototype into a modular, modern TypeScript + Vite project.
- Extracted and decoded embedded base64 map images into standalone optimized JPG assets under `public/maps/`, drastically reducing code bundle bloat.
- Separated concerns into modular architectural layers:
  - `src/map/canvas.ts` — Canvas lifecycle, double buffering, dynamic zoom, drag-to-pan, and PNG export.
  - `src/map/flood-fill.ts` — Barrier map extraction and scanline flood fill for closed lot boundaries.
  - `src/map/painting.ts` — Hit detection, mark rendering, legend drawing, and click handling.
  - `src/ui/` — Dependency-injected UI modules (`toolbar.ts`, `chips.ts`, `toast.ts`).

### What Broke & Lessons Learned
1. **Monolithic Asset Weight**:
   - *Problem*: The original single file stored ~9MB of image data as base64 data URIs inside JavaScript constants, freezing IDEs and bloating Git diffs.
   - *Fix*: Extracted each base64 string to `/public/maps/*.jpg` and referenced them via static URLs, bringing the source code down to lightweight TypeScript files.
2. **Coupling to the DOM**:
   - *Problem*: Pure business logic (e.g., hit detection, flood-fill calculation, chip counting) originally relied on direct `document.querySelector` queries everywhere.
   - *Fix*: Applied Dependency Injection. Canvas renderers and UI controllers now accept explicit parameters and elements, making functions testable in isolation.

---

## Phase 2: Database Design & Row Level Security (RLS)

### What Was Built
- Designed relational PostgreSQL schemas with Supabase:
  - `001_profiles.sql` — User profiles linked to `auth.users(id)` with strict role constraints (`admin`, `editor`, `viewer`).
  - `002_projects.sql` — Subdivision projects with map URLs and default legend coordinates.
  - `003_marks.sql` — Lot paint and pin status marks, plus a timestamped `mark_history` audit trail with an automated database trigger (`handle_mark_history()`).

### What Broke & Lessons Learned
1. **The RLS 42501 Boundary**:
   - *Incident*: Direct insertions using the public anon client failed with `42501 (new row violates row-level security policy for table "projects")`.
   - *Insight*: RLS operates at the database engine level. By default, with RLS enabled and no permissive policy for anonymous users, PostgreSQL safely rejects unauthenticated or unauthorized writes.
   - *Resolution*: Verified that seeding must occur via superuser context (SQL Editor / Migration pipeline) and verified that editors/admins must have matching role records in `profiles`.
2. **Audit Logging with Database Triggers**:
   - *Design Choice*: Rather than relying on the frontend client to reliably record mark history, implemented a `security definer` trigger (`on_mark_change`). Any `INSERT` or `UPDATE` on `marks` automatically creates a corresponding audit entry in `mark_history` without trusting the client.

---

## Phase 3: Connecting Frontend to Supabase

### What Was Built
- Created Supabase client wrapper (`src/api/supabase.ts`) with typed schemas.
- Implemented CRUD persistence service (`src/api/marks.ts`) following the `{ data, error }` pattern.
- Implemented project loader and dynamic selector (`src/api/projects.ts`).
- Created simple authentication modal UI (`src/ui/auth.ts`) supporting sign-in, sign-out, session restoration, and real-time auth state subscription.
- Integrated dual-layer storage: automatic real-time sync with Supabase when authenticated, with a resilient fallback to `localStorage` when offline or unauthenticated.

### What Broke & Lessons Learned
1. **TypeScript Typing with Supabase v2 Generics**:
   - *Problem*: Providing an incomplete manual generic schema caused `supabase.from('marks').upsert()` to evaluate value arguments as `never[]`.
   - *Cause*: In `@supabase/postgrest-js`, overloaded method signatures fall back to views if tables lack required index signatures or internal relationship definitions.
   - *Fix*: Configured clean client instantiation while applying strict interface typing directly at the service boundary (`MarkData`, `MarkRow`, `ApiResponse<T>`).
2. **Coordinate Normalization**:
   - *Problem*: Map canvas dimensions vary depending on the subdivision image resolution. Storing raw pixel coordinates creates fragility if assets are resized.
   - *Fix*: Normalized coordinates (`normX = x / mapWidth`, `normY = y / mapHeight`) between `0` and `1` when persisting to Supabase, and scaled back to pixel buffers upon canvas rendering.
3. **Optimistic Local Fallback**:
   - *Insight*: Viewers and offline users should not experience a broken UI if unauthenticated. The app renders instantly from local storage cache, and then updates seamlessly when Supabase data arrives.

---

## Phase 3 Manual Verification Checklist

- [x] **App loads and shows the map**: Default map and canvas layers render cleanly.
- [ ] **Login works with a test account**: User can sign in through the header modal.
- [ ] **Painting a lot saves to Supabase**: Authenticated writes create rows in `marks` table.
- [ ] **Refreshing the page loads saved marks**: Remote marks are retrieved and reconstructed into canvas boundaries.
- [ ] **Undo removes the last mark from Supabase**: Calls `deleteMark(id)` for the popped mark.
- [ ] **Clear all removes all marks for the project**: Calls `clearAllMarks(projectId)` in Supabase.
- [ ] **Different users see the same marks**: Opening two tabs or browsers displays synchronized marks.
