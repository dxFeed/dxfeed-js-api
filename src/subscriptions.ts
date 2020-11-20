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

type Queue = {
  reset: boolean

  add: CometdSeries<boolean>
  remove: CometdSeries<boolean>

  addTimeSeries: CometdSeries<{ fromTime: number }>
  removeTimeSeries: CometdSeries<boolean>
}

const createDefaultQueue = (): Queue => ({
  reset: false,

  add: {},
  remove: {},

  addTimeSeries: {},
  removeTimeSeries: {},
})

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

  queue: {
    reset: boolean

    add: CometdSeries<boolean>
    remove: CometdSeries<boolean>

    addTimeSeries: CometdSeries<{ fromTime: number }>
    removeTimeSeries: CometdSeries<boolean>
  } = createDefaultQueue()

  constructor(endpoint: Endpoint) {
    this.endpoint = endpoint

    endpoint.registerStateChangeHandler(this.onStateChange)
    endpoint.registerDataChangeHandler(this.onData)
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

        // Add in add queue
        this.queue.add = {
          ...this.queue.add,
          [eventType]: {
            ...this.queue.add[eventType],
            [eventSymbol]: true,
          },
        }
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

            this.queue.remove = {
              ...this.queue.remove,
              [eventType]: {
                ...this.queue.remove[eventType],
                [eventSymbol]: true,
              },
            }
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
    fromTime: number,
    onChange: (event: TEvent) => void
  ) {
    const handleEvent = (event: TEvent) => {
      if (event.time >= fromTime) {
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

        if (fromTime < subscription.fromTime) {
          subscription.fromTime = fromTime

          // Add in add queue
          this.queue.addTimeSeries = {
            ...this.queue.addTimeSeries,
            [eventType]: {
              ...this.queue.addTimeSeries[eventType],
              [eventSymbol]: {
                fromTime,
              },
            },
          }
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

          // Remove time from list
          subscription.fromTimes.splice(subscription.fromTimes.indexOf(fromTime), 1)

          const newListeners = subscription.listeners.filter((listener) => listener !== handleEvent)
          if (newListeners.length === 0) {
            delete this.timeSeriesSubscriptions[eventType][eventSymbol]

            // Remove from add queue
            if (this.queue.addTimeSeries[eventType]) {
              delete this.queue.addTimeSeries[eventType][eventSymbol]
            }

            this.queue.removeTimeSeries = {
              ...this.queue.removeTimeSeries,
              [eventType]: {
                ...this.queue.removeTimeSeries[eventType],
                [eventSymbol]: true,
              },
            }
          } else {
            subscription.listeners = newListeners

            const newFromTime = subscription.fromTimes.reduce(
              (result, time) => (fromTime < result ? time : result),
              Number.POSITIVE_INFINITY
            )
            if (subscription.fromTime !== newFromTime) {
              subscription.fromTime = newFromTime

              // Add in add queue
              this.queue.addTimeSeries = {
                ...this.queue.addTimeSeries,
                [eventType]: {
                  ...this.queue.addTimeSeries[eventType],
                  [eventSymbol]: {
                    fromTime: newFromTime,
                  },
                },
              }
            }
          }
        })
      })

      this.sendSubLater()
    }
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
