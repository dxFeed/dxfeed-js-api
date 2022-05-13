/** @license
 * Copyright ©2020 Devexperts LLC. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
 * If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { CometdSeries, EventType, ISubscriptionList } from './interfaces'

export function subMapToSetOfLists<T>(sub: CometdSeries<T>): ISubscriptionList {
  // sub : (type :-> symbol :-> subItem), returns (type :-> [symbol])
  return Object.entries(sub).reduce((acc, value) => {
    acc[value[0] as EventType] = Object.keys(value[1])
    return acc
  }, {} as ISubscriptionList)
}

export const toBooleanCometdSub = <T>(sub: CometdSeries<T>) =>
  Object.keys(sub).reduce((acc, key) => {
    const eventType = key as EventType
    acc[eventType] = Object.keys(sub[eventType]).reduce((innerAcc, innerKey) => {
      innerAcc[innerKey] = Boolean(sub[eventType][innerKey])
      return innerAcc
    }, {} as Record<string, boolean>)
    return acc
  }, {} as CometdSeries<boolean>)

function timeSeriesSubSetToList(obj: Record<string, { fromTime: number } | boolean>) {
  return Object.keys(obj).map((key) => {
    const options = obj[key]

    if (options !== true && options !== false) {
      return {
        eventSymbol: key,
        fromTime: options.fromTime,
      }
    }

    return {
      eventSymbol: key,
    }
  })
}

export function timeSeriesSubMapToSetOfLists(sub: CometdSeries<{ fromTime: number } | boolean>) {
  return Object.entries(sub).reduce((acc, value) => {
    acc[value[0]] = timeSeriesSubSetToList(value[1])
    return acc
  }, {} as Record<string, { fromTime?: number; eventSymbol: string }[]>)
}

export const isEmptySet = (obj: object) => Object.keys(obj).length === 0

export const splitChunks = <Value>(values: Value[], chunkSize: number) => {
  const results: Value[][] = []

  for (let offset = 0; offset < values.length; offset += chunkSize) {
    results.push(values.slice(offset, offset + chunkSize))
  }

  return results
}
