export const LOOP_MIME = "application/x-houseband-loop"

/** dataTransfer contents are unreadable during dragover, so the active loop id is tracked here. */
export const dragState: { loopId: string | null } = { loopId: null }
