# Plan: File Uploads, Media Gallery & Rich Text for Sale Creation

## Context
The sale creation wizard currently uses plain URL text inputs for all media (banner image, team photos, documents). There is no file upload capability despite the backend upload endpoint and GCS integration being fully ready. The full description field uses a plain textarea instead of the existing RichTextEditor. Users need a proper image/video gallery with hero selection, file upload widgets, and rich text editing.

---

## Phase 1: Backend — Upload visibility + ImageCreate schema

### 1a. `apps/api/api/v1/endpoints/uploads.py`
- Add `visibility: str = Query(default="auto")` param to `upload_file`
- When `"public"` → force public bucket (overrides PDF→private routing)
- When `"private"` → force private bucket
- When `"auto"` → keep existing `is_private_content()` behavior
- Validate allowed values

### 1b. `apps/api/api/v1/endpoints/sale_content.py`
- Add `media_type: str = "image"` and `video_url: str | None = None` to `ImageCreate` schema
- Add same fields to `ImageResponse` schema
- Pass them through in `add_image` handler to `SaleImage(...)` constructor

---

## Phase 2: Admin Proxy — Multipart support

### 2a. `apps/admin/src/app/api/proxy/[...path]/route.ts`
- Detect if incoming request `Content-Type` starts with `multipart/form-data`
- If multipart: forward raw body as `arrayBuffer()`, do NOT set Content-Type (let boundary propagate)
- If JSON: keep existing behavior
- ~15 lines changed

### 2b. `apps/admin/src/lib/api/client.ts` — Add `apiUpload()`
- New exported function using `XMLHttpRequest` for progress tracking
- Sends `FormData` to `/api/proxy/api/v1/uploads?prefix=...&visibility=...`
- Returns `{ url, path, content_type, size, private }`
- Credentials via cookie (same-origin, cookies auto-included)
- ~60 LOC

---

## Phase 3: FileUpload Atom Component

### New: `apps/admin/src/components/atoms/FileUpload.tsx`
- Drag-and-drop zone + click-to-browse
- File type/size validation before upload
- Progress bar during upload
- Preview: image thumbnail or PDF file name+icon
- Remove button
- Props: `accept`, `maxSizeMB`, `value` (current URL), `onUpload`, `onRemove`, `prefix`, `visibility`, `previewType`
- ~180 LOC

### Update: `apps/admin/src/components/atoms/index.ts`
- Export `FileUpload`

---

## Phase 4: ImageGallery Molecule

### New: `apps/admin/src/components/molecules/ImageGallery.tsx`
- Grid of uploaded image thumbnails + 1 video slot
- "Add Image" triggers FileUpload (max 5 images)
- "Add Video" input for YouTube/Vimeo URL (max 1 video)
- Star icon to select hero (sets `is_banner: true`)
- Up/down arrows for reorder (sort_order)
- Delete per item
- Counter: "3/5 images, 0/1 video"
- ~250 LOC

---

## Phase 5: Sale Creation Wizard Updates

### Modify: `apps/admin/src/app/issuer/sales/new/page.tsx`

**Step renumbering** (new step order):
1. Sale Info (unchanged)
2. Content — swap textarea→RichTextEditor for `fullDescription`, remove banner URL input
3. **Gallery** (NEW) — ImageGallery component, state: `galleryItems[]`
4. Team — swap photo URL input→FileUpload
5. FAQ & Docs — swap doc URL input→FileUpload, RichTextEditor for FAQ answers
6. Phases (conditional)
7. Token & Caps (conditional)
8. Vesting (conditional)
9. Review — updated summary

**State changes:**
- Add `galleryItems` state array
- Derive `bannerImageUrl` from `galleryItems.find(i => i.is_banner)?.url`
- Remove `bannerImageUrl` standalone state

**handleSaveDraft update:**
- After sale creation, iterate `galleryItems` and call `addSaleImage()` for each

**canProceed update:**
- Gallery step: always allow (optional)

---

## Phase 6: Sales Repository — Image functions

### Modify: `apps/admin/src/lib/api/repositories/sales.ts`
- Add `ImageData` interface with `url, caption, is_banner, sort_order, media_type, video_url`
- Add `addSaleImage(saleId, data)` function
- Add `removeSaleImage(saleId, imageId)` function
- ~30 LOC added

---

## Phase 7: Launchpad — Video in gallery

### Modify: `apps/launchpad/src/app/project/[slug]/page.tsx`
- Update `SaleImage` interface: add `media_type`, `video_url`
- Hero area: if selected item is video, render YouTube/Vimeo iframe embed instead of `<Image>`
- Gallery strip: play icon overlay on video thumbnails
- Helper: `getEmbedUrl(url)` to convert watch URLs to embed URLs
- ~40 LOC added

---

## Implementation Order

```
Phase 1 (backend) → Phase 2 (proxy + apiUpload) → Phase 3 (FileUpload atom)
                                                  → Phase 6 (sales repo)
Phase 3 + Phase 6 → Phase 4 (ImageGallery) → Phase 5 (wizard)
Phase 1b → Phase 7 (launchpad video)
```

Phases 1, 2, 6 can be done first in one pass. Then 3 + 4, then 5, then 7.

---

## Files Summary

| Action | File | Est. LOC |
|--------|------|----------|
| Modify | `apps/api/api/v1/endpoints/uploads.py` | +15 |
| Modify | `apps/api/api/v1/endpoints/sale_content.py` | +10 |
| Modify | `apps/admin/src/app/api/proxy/[...path]/route.ts` | +15 |
| Modify | `apps/admin/src/lib/api/client.ts` | +60 |
| **Create** | `apps/admin/src/components/atoms/FileUpload.tsx` | ~180 |
| Modify | `apps/admin/src/components/atoms/index.ts` | +1 |
| **Create** | `apps/admin/src/components/molecules/ImageGallery.tsx` | ~250 |
| Modify | `apps/admin/src/lib/api/repositories/sales.ts` | +30 |
| Modify | `apps/admin/src/app/issuer/sales/new/page.tsx` | ~+80 |
| Modify | `apps/launchpad/src/app/project/[slug]/page.tsx` | +40 |

---

## Verification

1. **Backend**: `curl -X POST /api/v1/uploads -F file=@test.pdf -F prefix=documents --query visibility=public` → verify file lands in public bucket
2. **Admin UI**: Create new sale → Step 2: rich text editor works → Step 3: upload images, add video URL, select hero → Step 4: upload team photo → Step 5: upload PDF document
3. **Launchpad**: View sale with gallery → click thumbnails to switch hero → video plays in hero area
4. **Tests**: `npx playwright test coming-soon-sale.flow.ts --project=api-flow`
