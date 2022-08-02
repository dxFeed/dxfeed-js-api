/** @license
 * Copyright ©2020 Devexperts LLC. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
 * If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Endpoint } from './endpoint'
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

class Feed {
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
}

export default Feed
