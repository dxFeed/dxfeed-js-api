/** @license
 * Copyright ©2020 Devexperts LLC. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
 * If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Endpoint } from './endpoint'
import {
  CometdSeries,
  EventType,
  IEvent,
  IFeedImplState,
  IncomingData,
  ISubscribeMessage,
  ITimeSeriesEvent,
  ITotalSubItem,
  ITotalTimeSeriesSubItem,
} from './interfaces'
import {
  isEmptySet,
  splitChunks,
  subMapToSetOfLists,
  timeSeriesSubMapToSetOfLists,
  toBooleanCometdSub,
} from './utils'

interface ITimeSeriesOptions {
  fromTime: number | undefined
}

type Queue = {
  reset: boolean

  count: number

  add: CometdSeries<boolean>
  remove: CometdSeries<boolean>

  addTimeSeries: CometdSeries<ITimeSeriesOptions>
  removeTimeSeries: CometdSeries<boolean>
}

const createDefaultQueue = (): Queue => ({
  reset: false,

  count: 0,

  add: {},
  remove: {},

  addTimeSeries: {},
  removeTimeSeries: {},
})

const MAX_ACTIONS_SIZE = 200

export class Subscriptions {
  endpoint: Endpoint
  sendSubTimeout: number | null = null

  schemeTypes: {
    [key: string]: string[]
  } = {}

  state: IFeedImplState = {
    connected: false,
    replaySupported: undefined, // will determined after connection
    replay: false,
    clear: false,
    time: 0,
    speed: 0,
  }

  subscriptions: CometdSeries<ITotalSubItem> = {}
  timeSeriesSubscriptions: CometdSeries<ITotalTimeSeriesSubItem> = {}

  queue: Queue = createDefaultQueue()

  constructor(endpoint: Endpoint) {
    this.endpoint = endpoint

    endpoint.registerStateChangeHandler(this.onStateChange)
    endpoint.registerDataChangeHandler(this.onData)
  }

  sendSub = () => {
    const message: ISubscribeMessage = {}

    const queue = this.queue
    this.queue = createDefaultQueue()

    if (queue.reset) {
      message.reset = true
      queue.add = toBooleanCometdSub(this.subscriptions)
      queue.remove = {}
      queue.addTimeSeries = this.timeSeriesSubscriptions
      queue.removeTimeSeries = {}
    }

    if (!isEmptySet(queue.add)) {
      message.add = subMapToSetOfLists(queue.add)
    }
    if (!isEmptySet(queue.remove)) {
      message.remove = subMapToSetOfLists(queue.remove)
    }
    if (!isEmptySet(queue.addTimeSeries)) {
      message.addTimeSeries = timeSeriesSubMapToSetOfLists(queue.addTimeSeries)
    }
    if (!isEmptySet(queue.removeTimeSeries)) {
      message.removeTimeSeries = subMapToSetOfLists(queue.removeTimeSeries)
    }
    if (!isEmptySet(message)) {
      this.endpoint.updateSubscriptions(message)
    }
  }

  sendSubLater() {
    if (this.queue.count > MAX_ACTIONS_SIZE) {
      if (this.sendSubTimeout !== null) {
        clearTimeout(this.sendSubTimeout)
        this.sendSubTimeout = null
      }

      return this.sendSub()
    }

    if (this.sendSubTimeout === null) {
      this.sendSubTimeout = setTimeout(() => {
        this.sendSubTimeout = null
        this.sendSub()
      }, 0)
    }
  }

  subscribe<TEvent extends IEvent = IEvent>(
    eventTypes: EventType[],
    eventSymbols: string[],
    onChange: (event: TEvent) => void
  ) {
    eventTypes.forEach((eventType) => {
      if (!this.subscriptions[eventType]) {
        this.subscriptions[eventType] = {}
      }

      eventSymbols.forEach((eventSymbol) => {
        if (!this.subscriptions[eventType][eventSymbol]) {
          this.subscriptions[eventType][eventSymbol] = {
            listeners: [],
          }
        }

        // Add listeners
        this.subscriptions[eventType][eventSymbol].listeners.push(onChange /* FIXME */ as any)

        // Delete from remove queue
        if (this.queue.remove[eventType]) {
          delete this.queue.remove[eventType][eventSymbol]
        }

        this.addQueue(eventType, eventSymbol)
      })
    })

    this.sendSubLater()

    // Return unsubscribe handler
    return () => {
      eventTypes.forEach((eventType) => {
        eventSymbols.forEach((eventSymbol) => {
          const subscription = this.subscriptions[eventType][eventSymbol]

          const newListeners = subscription.listeners.filter((listener) => listener !== onChange)
          if (newListeners.length === 0) {
            delete this.subscriptions[eventType][eventSymbol]

            // Remove from add queue
            if (this.queue.add[eventType]) {
              delete this.queue.add[eventType][eventSymbol]
            }

            this.removeQueue(eventType, eventSymbol)
          } else {
            subscription.listeners = newListeners
          }
        })
      })

      this.sendSubLater()
    }
  }

  subscribeTimeSeries<TEvent extends ITimeSeriesEvent = ITimeSeriesEvent>(
    eventTypes: EventType[],
    eventSymbols: string[],
    fromTime: number | undefined,
    onChange: (event: TEvent) => void
  ) {
    const fromTimeRestriction = fromTime === undefined ? Date.now() : fromTime

    const handleEvent = (event: TEvent) => {
      if (event.time >= fromTimeRestriction) {
        onChange(event)
      }
    }

    eventTypes.forEach((eventType) => {
      if (!this.timeSeriesSubscriptions[eventType]) {
        this.timeSeriesSubscriptions[eventType] = {}
      }

      eventSymbols.forEach((eventSymbol) => {
        if (!this.timeSeriesSubscriptions[eventType][eventSymbol]) {
          this.timeSeriesSubscriptions[eventType][eventSymbol] = {
            listeners: [],
            fromTime: Number.MAX_SAFE_INTEGER,
            fromTimes: [],
          }
        }

        // Add listeners
        const subscription = this.timeSeriesSubscriptions[eventType][eventSymbol]
        subscription.listeners.push(handleEvent /* FIXME */ as any)
        subscription.fromTimes.push(fromTime)

        if (fromTime === undefined && subscription.fromTimes.length === 1) {
          this.addTimeSeriesQueue(eventType, eventSymbol, { fromTime: undefined })
          /*
           * Cases when incoming subscription timestamp is the same must trigger subscription too
           * (e.g. two simultaneous subscriptions coming from different clients)
           */
        } else if (fromTime !== undefined && fromTime <= subscription.fromTime) {
          subscription.fromTime = fromTime

          this.addTimeSeriesQueue(eventType, eventSymbol, {
            fromTime,
          })
        }

        // Delete from remove queue
        if (this.queue.removeTimeSeries[eventType]) {
          delete this.queue.removeTimeSeries[eventType][eventSymbol]
        }
      })
    })

    this.sendSubLater()

    // Return unsubscribe handler
    return () => {
      eventTypes.forEach((eventType) => {
        eventSymbols.forEach((eventSymbol) => {
          const subscription = this.timeSeriesSubscriptions[eventType][eventSymbol]

          const itemIndex = subscription.listeners.findIndex((listener) => listener === handleEvent)
          // Remove time from list
          subscription.fromTimes.splice(itemIndex, 1)

          const newListeners = subscription.listeners
            .slice(0, itemIndex)
            .concat(subscription.listeners.slice(itemIndex + 1, subscription.listeners.length))

          if (newListeners.length === 0) {
            delete this.timeSeriesSubscriptions[eventType][eventSymbol]

            // Remove from add queue
            if (this.queue.addTimeSeries[eventType]) {
              delete this.queue.addTimeSeries[eventType][eventSymbol]
            }

            this.removeTimeSeriesQueue(eventType, eventSymbol)
          } else {
            subscription.listeners = newListeners

            const newFromTime = subscription.fromTimes.reduce(
              (result, time) => (fromTime !== undefined && fromTime < result ? time : result),
              Number.POSITIVE_INFINITY
            )
            if (subscription.fromTime !== newFromTime) {
              subscription.fromTime = newFromTime

              const options =
                newFromTime === Number.POSITIVE_INFINITY
                  ? { fromTime: undefined }
                  : {
                      fromTime: newFromTime,
                    }

              this.addTimeSeriesQueue(eventType, eventSymbol, options)
            }
          }
        })
      })

      this.sendSubLater()
    }
  }

  private onStateChange = (stateChange: Partial<IFeedImplState>) => {
    if (stateChange.connected) {
      this.queue.reset = true
      this.sendSubLater()
    }

    Object.entries(stateChange).forEach(([key, val]) => {
      this.state[key] = val
    })
  }

  private addQueue = (eventType: EventType, eventSymbol: string) => {
    this.queue.add = {
      ...this.queue.add,
      [eventType]: {
        ...this.queue.add[eventType],
        [eventSymbol]: true,
      },
    }

    this.queue.count++
  }

  private removeQueue = (eventType: EventType, eventSymbol: string) => {
    this.queue.remove = {
      ...this.queue.remove,
      [eventType]: {
        ...this.queue.remove[eventType],
        [eventSymbol]: true,
      },
    }

    this.queue.count++
  }

  private addTimeSeriesQueue = (
    eventType: EventType,
    eventSymbol: string,
    options: ITimeSeriesOptions
  ) => {
    this.queue.addTimeSeries = {
      ...this.queue.addTimeSeries,
      [eventType]: {
        ...this.queue.addTimeSeries[eventType],
        [eventSymbol]: options,
      },
    }

    this.queue.count++
  }

  private removeTimeSeriesQueue = (eventType: EventType, eventSymbol: string) => {
    this.queue.removeTimeSeries = {
      ...this.queue.removeTimeSeries,
      [eventType]: {
        ...this.queue.removeTimeSeries[eventType],
        [eventSymbol]: true,
      },
    }

    this.queue.count++
  }

  private onData = ([headData, bodyData]: IncomingData, timeSeries: boolean) => {
    const subscriptions = timeSeries ? this.timeSeriesSubscriptions : this.subscriptions

    let eventType: EventType
    let scheme: string[]

    if (typeof headData === 'string') {
      eventType = headData
      scheme = this.schemeTypes[eventType]
    } else {
      ;[eventType, scheme] = headData

      this.schemeTypes[eventType] = scheme
    }

    const subscription = subscriptions[eventType]
    if (!subscription) {
      return
    }

    const eventsValues = splitChunks(bodyData, scheme.length)
    eventsValues.forEach((values) => {
      const event: IEvent = {
        eventType,
        eventSymbol: '',
      }

      scheme.forEach((eventPropertyName, eventPropertyIndex) => {
        event[eventPropertyName] = values[eventPropertyIndex]
      })

      subscription[event.eventSymbol]?.listeners.forEach((listener) => listener(event))
    })
  }
}
