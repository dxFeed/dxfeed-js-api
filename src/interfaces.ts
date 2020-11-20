/** @license
 * Copyright ©2020 Devexperts LLC. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
 * If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

export enum EventType {
  Quote = 'Quote',
  Candle = 'Candle',
  Trade = 'Trade',
  Summary = 'Summary',
  Profile = 'Profile',
}

export interface IEvent {
  eventType: EventType
  eventSymbol: string
  [key: string]: string | number
}

export interface ITimeSeriesEvent extends IEvent {
  index: number
  time: number
}

export type CometdSeries<T> = {
  [eventType in EventType]?: {
    [eventSymbol: string]: T
  }
}

export type ISubscriptionList = {
  [eventType in EventType]?: string[]
}

export type ITimeSeriesList = {
  [eventType in EventType]?: { fromTime: number; eventSymbol: string }[]
}

export type IncomingData = [
  EventType | [EventType, string[]], // head
  (string | number)[] // body
]

export interface ITotalSubItem {
  listeners: ((event: IEvent) => void)[]
}

export interface ITotalTimeSeriesSubItem {
  listeners: ((event: IEvent) => void)[]
  fromTime: number
  fromTimes: number[]
}

export interface IFeedImplState {
  connected: boolean
  replaySupported?: boolean
  replay: boolean
  clear: boolean
  time: number
  speed: number
  [key: string]: IFeedImplState[keyof IFeedImplState]
}

export interface ISubscribeMessage {
  reset?: boolean

  add?: ISubscriptionList
  remove?: ISubscriptionList
  addTimeSeries?: ITimeSeriesList
  removeTimeSeries?: ISubscriptionList
}
