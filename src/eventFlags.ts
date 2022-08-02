/** @license
 * Copyright ©2020 Devexperts LLC. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
 * If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

export enum EventFlag {
  /**
   * (0x01) TX_PENDING indicates a pending transactional update. When TX_PENDING is 1, it means that an ongoing transaction
   * update, that spans multiple events, is in process.
   */
  TxPending = 0x01,

  /**
   * (0x02) REMOVE_EVENT indicates that the event with the corresponding index has to be removed.
   */
  RemoveEvent = 0x02,

  /**
   * (0x04) SNAPSHOT_BEGIN indicates when the loading of a snapshot starts. Snapshot load starts on new subscription and
   * the first indexed event that arrives for each exchange code (in the case of a regional record) on a new
   * subscription may have SNAPSHOT_BEGIN set to true. It means that an ongoing snapshot consisting of multiple
   * events is incoming.
   */
  SnapshotBegin = 0x04,

  /**
   * (0x08) SNAPSHOT_END or (0x10) SNAPSHOT_SNIP indicates the end of a snapshot. The difference between SNAPSHOT_END and
   * SNAPSHOT_SNIP is the following: SNAPSHOT_END indicates that the data source sent all the data pertaining to
   * the subscription for the corresponding indexed event, while SNAPSHOT_SNIP indicates that some limit on the
   * amount of data was reached and while there still might be more data available, it will not be provided.
   */
  SnapshotEnd = 0x08,

  /**
   * (0x08) SNAPSHOT_END or (0x10) SNAPSHOT_SNIP indicates the end of a snapshot. The difference between SNAPSHOT_END and
   * SNAPSHOT_SNIP is the following: SNAPSHOT_END indicates that the data source sent all the data pertaining to
   * the subscription for the corresponding indexed event, while SNAPSHOT_SNIP indicates that some limit on the
   * amount of data was reached and while there still might be more data available, it will not be provided.
   */
  SnapshotSnip = 0x10,
}

export interface EventFlags {
  txPending: boolean
  shouldBeRemoved: boolean
  snapshotBegin: boolean
  snapshotEnd: boolean
  snapshotSnip: boolean
}

/* tslint:disable:no-bitwise */
export const parseEventFlags = (flags: number): EventFlags => ({
  txPending: (flags & EventFlag.TxPending) > 0,
  shouldBeRemoved: (flags & EventFlag.RemoveEvent) > 0,
  snapshotBegin: (flags & EventFlag.SnapshotBegin) > 0,
  snapshotEnd: (flags & EventFlag.SnapshotEnd) > 0,
  snapshotSnip: (flags & EventFlag.SnapshotSnip) > 0,
})
