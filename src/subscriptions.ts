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
  fromTime: number
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

const MAX_QUEUE_SIZE = 200

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
  stateSubscriptions: Set<(state: IFeedImplState) => void> = new Set()

  queue: Queue = createDefaultQueue()

  constructor(endpoint: Endpoint) {
    this.endpoint = endpoint

    endpoint.registerStateChangeHandler(this.changeState)
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
      queue.reset = false
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

  scheduleSendSub() {
    // if queue is full, send it immediately
    if (this.queue.count > MAX_QUEUE_SIZE) {
      // Clear scheduled sendSub
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

        /**
         * When backend receives message with `add` for the first time for symbol subscription, it immediately
         * pushes last ticker's value to a subscriber. The same is relevant for situation when backend receives
         * message with `remove`, and then, some ticks later, it receives another message with `add`.
         *
         * If `add` and `remove` are sent in one message, backend treats them in the following order: first remove
         * subscription, then add it back and push last value of ticker into it.
         *
         * When code below is not commented out, it deletes `remove` from message in situation
         * when `add` and `remove` occur in one tick. This makes backend treat message as "update subscription",
         * which effectively means "do nothing". New subscriber won't receive last value of ticker because subscription
         * already exists, and will only receive the next ticker update.
         *
         * This sometimes leads to cases when ticker appears empty for new subscribers of a rarely updated symbols.
         * (Related issue: EN-4718)
         */

        // if (this.queue.remove[eventType]) {
        //   delete this.queue.remove[eventType][eventSymbol]
        // }

        this.queueAction('add', eventType, eventSymbol)
      })
    })

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

            this.queueAction('remove', eventType, eventSymbol)
          } else {
            subscription.listeners = newListeners
          }
        })
      })
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

        // Delete from remove queue
        if (this.queue.removeTimeSeries[eventType]) {
          delete this.queue.removeTimeSeries[eventType][eventSymbol]
        }

        /*
         * Cases when incoming subscription timestamp is the same must trigger subscription too
         * (e.g. two simultaneous subscriptions coming from different clients)
         */
        if (fromTime <= subscription.fromTime) {
          subscription.fromTime = fromTime

          this.queueTimeSeriesAction('add', eventType, eventSymbol, {
            fromTime,
          })
        }
      })
    })

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

            this.queueTimeSeriesAction('remove', eventType, eventSymbol)
          } else {
            subscription.listeners = newListeners

            const newFromTime = subscription.fromTimes.reduce(
              (result, time) => (fromTime < result ? time : result),
              Number.POSITIVE_INFINITY
            )
            if (subscription.fromTime !== newFromTime) {
              subscription.fromTime = newFromTime

              this.queueTimeSeriesAction('add', eventType, eventSymbol, {
                fromTime: newFromTime,
              })
            }
          }
        })
      })
    }
  }

  subscribeState = (listener: (state: IFeedImplState) => void) => {
    listener(this.state)
    this.stateSubscriptions.add(listener)
    return () => {
      this.stateSubscriptions.delete(listener)
    }
  }

  changeState = (stateChange: Partial<IFeedImplState>) => {
    if (stateChange.connected) {
      this.queue.reset = true
      this.scheduleSendSub()
    }

    Object.entries(stateChange).forEach(([key, val]) => {
      this.state[key] = val
    })

    this.stateSubscriptions.forEach((listener) => listener(this.state))
  }

  private queueAction = (action: 'add' | 'remove', eventType: EventType, eventSymbol: string) => {
    this.queue[action] = {
      ...this.queue[action],
      [eventType]: {
        ...this.queue[action][eventType],
        [eventSymbol]: true,
      },
    }

    this.queue.count++

    this.scheduleSendSub()
  }

  private queueTimeSeriesAction = (
    action: 'add' | 'remove',
    eventType: EventType,
    eventSymbol: string,
    options?: ITimeSeriesOptions
  ) => {
    if (action === 'add') {
      this.queue.addTimeSeries = {
        ...this.queue.addTimeSeries,
        [eventType]: {
          ...this.queue.addTimeSeries[eventType],
          [eventSymbol]: options,
        },
      }
    } else {
      this.queue.removeTimeSeries = {
        ...this.queue.removeTimeSeries,
        [eventType]: {
          ...this.queue.removeTimeSeries[eventType],
          [eventSymbol]: true,
        },
      }
    }

    this.queue.count++

    this.scheduleSendSub()
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

      const subscriptionItem = subscription[event.eventSymbol]
      if (subscriptionItem) {
        subscriptionItem.listeners.forEach((listener) => listener(event))
      }
    })
  }
}
