export const TX_PENDING_FLAG = 1
export const REMOVE_EVENT_FLAG = 2
export const SNAPSHOT_BEGIN_FLAG = 4
export const SNAPSHOT_END_FLAG = 8
export const SNAPSHOT_SNIP_FLAG = 16

export interface EventFlags {
  txPending: boolean
  shouldBeRemoved: boolean
  snapshotBegin: boolean
  snapshotEnd: boolean
  snapshotSnip: boolean
}

/* tslint:disable:no-bitwise */
export const parseEventFlags = (flags: number): EventFlags => ({
  txPending: (flags & TX_PENDING_FLAG) > 0,
  shouldBeRemoved: (flags & REMOVE_EVENT_FLAG) > 0,
  snapshotBegin: (flags & SNAPSHOT_BEGIN_FLAG) > 0,
  snapshotEnd: (flags & SNAPSHOT_END_FLAG) > 0,
  snapshotSnip: (flags & SNAPSHOT_SNIP_FLAG) > 0,
})
