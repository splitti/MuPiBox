// Box-side category taxonomy. MUST stay in sync with the frontend's
// `CategoryType` in src/frontend-box/src/app/media.ts. The four-value
// set is fixed by the existing box-frontend grouping logic — do NOT
// extend without coordinating with the frontend.
//
// Smart-Sync produces only `audiobook` and `music`. `other` (Radio/RSS)
// and `resume` (internal) are never written by sync; they remain in the
// manual / system-managed code paths.
export type CategoryType = 'audiobook' | 'music' | 'other' | 'resume'

/** Categories that Smart-Sync is allowed to assign. */
export const SYNC_ALLOWED_CATEGORIES: ReadonlyArray<CategoryType> = ['audiobook', 'music']
