/** @license
 * Copyright ©2020 Devexperts LLC. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
 * If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Endpoint } from './endpoint'
import { parseEventFlags } from './eventFlags'
import { EventType, IEvent, ITimeSeriesEvent } from './interfaces'
import { Subscriptions } from './subscriptions'
import {
  isFinishedTimeSeriesAggregationResult,
  newTimeSeriesAggregator,
} from './timeSeriesAggregator'
import { newPromiseWithResource } from './utils'

/* tslint:disable:max-classes-per-file */
export class TimeoutError extends Error {}
export class AbortedError extends Error {}

export class Feed {
  endpoint: Endpoint
  subscriptions: Subscriptions

  constructor() {
    this.endpoint = new Endpoint()
    this.subscriptions = new Subscriptions(this.endpoint)
  }

  setAuthToken = (token: string) => {
    this.endpoint.setAuthToken(token)
  }

  connect = (url: string) => {
    this.endpoint.connect({ url })
  }

  disconnect = () => {
    this.endpoint.disconnect()
  }

  subscribe = <TEvent extends IEvent>(
    eventTypes: EventType[],
    eventSymbols: string[],
    onChange: (event: TEvent) => void
  ) => this.subscriptions.subscribe(eventTypes, eventSymbols, onChange)

  subscribeTimeSeries = <TEvent extends ITimeSeriesEvent>(
    eventTypes: EventType[],
    eventSymbols: string[],
    fromTime: number,
    onChange: (event: TEvent) => void
  ) => this.subscriptions.subscribeTimeSeries(eventTypes, eventSymbols, fromTime, onChange)

  /**
   * requires that incoming events have index, time and eventFlags to work correctly
   *
   * (!) expected that this method is not used alongside Feed.subscribeTimeSeries, it may not work correctly
   *
   * @param fromTime - A Number representing the milliseconds elapsed since the UNIX epoch
   * @param toTime - A Number representing the milliseconds elapsed since the UNIX epoch
   * @param options - default options has 15 seconds timeout
   */
  getTimeSeries = <TEvent extends ITimeSeriesEvent>(
    eventSymbol: string,
    eventType: EventType,
    fromTime: number,
    toTime: number,
    options?: {
      signal?: AbortController['signal']
      timeoutMs?: number
    }
  ): Promise<TEvent[]> =>
    newPromiseWithResource((resolve, reject, useResource) => {
      useResource(() => {
        const timeoutId = setTimeout(() => {
          reject(new TimeoutError())
        }, options?.timeoutMs ?? 15_000)
        return () => clearTimeout(timeoutId)
      })

      useResource(() => {
        const abortSignalListener = () => reject(new AbortedError())
        options?.signal?.addEventListener('abort', abortSignalListener)

        return () => options?.signal?.removeEventListener('abort', abortSignalListener)
      })

      useResource(() => {
        const aggregator = newTimeSeriesAggregator<TEvent>(fromTime, toTime)

        const handleEvent = (event: TEvent) => {
          const result = aggregator.newEvent(event)

          if (isFinishedTimeSeriesAggregationResult(result)) resolve(result.events)
        }

        const unsubscribeTimeSeries = this.subscriptions.subscribeTimeSeries<TEvent>(
          [eventType],
          [eventSymbol],
          fromTime,
          handleEvent
        )

        return () => unsubscribeTimeSeries()
      })
    })

  /**
   * requires that incoming events have index, time and eventFlags to work correctly
   *
   * (!) expected that this method is not used alongside Feed.subscribeTimeSeries, it may not work correctly
   *
   * @param eventSymbol - A String representing the symbol of the event
   * @param eventType - A String representing the type of the event
   * @param fromTime - A Number representing the milliseconds elapsed since the UNIX epoch
   * @param onChange - A Function called when the snapshot is received
   * @returns - A Function that unsubscribes from the snapshot updates
   */
  subscribeTimeSeriesSnapshot = <IEvent extends ITimeSeriesEvent>(
    eventSymbol: string,
    eventType: EventType,
    fromTime: number,
    onChange: (snapshot: IEvent[]) => void
  ) => {
    let snapshotPart = false // snapshot pending
    let snapshotFull = false // snapshot received in pending queue
    let tx = false // transaction pending

    let pQueue: IEvent[] = [] // pending queue

    let events: Record<number, IEvent> = {} // events accumulator

    return this.subscribeTimeSeries<IEvent>([eventType], [eventSymbol], fromTime, (event) => {
      const flags = parseEventFlags(event.eventFlags)

      tx = flags.txPending

      // Process snapshot start and clear params
      if (flags.snapshotBegin) {
        pQueue = [] // clear pending queue on new snapshot
        snapshotPart = true // snapshot pending
        snapshotFull = false // snapshot not received yet
      }

      // Process snapshot end after snapshot begin was received
      if (snapshotPart && (flags.snapshotEnd || flags.snapshotSnip)) {
        snapshotPart = false
        snapshotFull = true
      }

      pQueue.push(event)

      if (snapshotPart || tx) {
        return
      }

      if (snapshotFull) {
        snapshotFull = false
        events = {} // remove any unprocessed leftovers on new snapshot
      }

      // process pending queue
      let hasChanged = false
      for (const event of pQueue) {
        const { shouldBeRemoved } = parseEventFlags(event.eventFlags)

        if (shouldBeRemoved) {
          if (events[event.index] === undefined) {
            // nothing to do on remove on non-existing event
            continue
          }

          // remove existing event
          delete events[event.index]
        } else {
          // cleanup the flags in the stored event
          event.eventFlags = 0
          events[event.index] = event
        }

        hasChanged = true
      }
      pQueue = []

      if (hasChanged) {
        // notify about changes
        onChange(Object.values(events).sort((a, b) => a.index - b.index))
      }
    })
  }
}
