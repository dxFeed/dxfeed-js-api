/** @license
 * Copyright ©2020 Devexperts LLC. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
 * If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

jest.mock('./endpoint')

import Feed from './feed'
import { EventType } from './interfaces'

describe('Feed', () => {
  let instance: Feed

  beforeEach(() => {
    jest.useFakeTimers()
    instance = new Feed()
  })

  it('mock should work', () => {
    expect((instance.endpoint as any).mock).toBeTruthy()
  })

  it('should trigger series sub event on data', () => {
    const eventType = EventType.Summary
    const eventSymbol = 'AEX.IND:TEI'

    let dataResults
    const handleEvent = jest.fn((data) => {
      dataResults = data
    })

    instance.subscribe([eventType], [eventSymbol], handleEvent)

    instance.endpoint.handlers?.onData(
      [
        [eventType, ['eventSymbol', 'eventTime']],
        [eventSymbol, 0],
      ],
      false
    )

    jest.runAllTimers()

    expect(handleEvent).toBeCalled()

    expect(dataResults).toEqual({
      eventSymbol,
      eventTime: 0,
      eventType,
    })
  })

  it('should trigger time series sub event on data', () => {
    const eventType = EventType.Candle
    const eventSymbol = 'AEX.IND:TEI{=15m}'

    let dataResults
    const handleEvent = jest.fn((data) => {
      dataResults = data
    })

    instance.subscribeTimeSeries([eventType], [eventSymbol], handleEvent, 0)

    instance.endpoint.handlers?.onData(
      [
        [eventType, ['eventSymbol', 'eventTime', 'eventFlags', 'index', 'time']],
        [
          ...[eventSymbol, 0, 0, 6829250544717005000, 1590058800000],
          ...[eventSymbol, 0, 0, 6829246679246438000, 1590057900000],
        ],
      ],
      true
    )

    jest.runAllTimers()

    expect(handleEvent).toBeCalled()
    expect(dataResults).toBeDefined()

    expect(dataResults).toHaveProperty('eventType', eventType)
    expect(dataResults).toHaveProperty('eventSymbol', eventSymbol)
  })

  // TODO: Нужен тест проверяющий разные типы обработки Data, когда уже есть структура в памяти для какого-то эвента
})

describe('Feed - subscriptions', () => {
  let instance: Feed

  const eventType = EventType.Summary
  const symbolsSet1 = ['1', '2', '3', '4']
  const symbolsSet2 = ['2', '3']

  const createSubscription = (symbols: string[]) =>
    instance.subscribe([eventType], symbols, () => 0)

  const createMultipleSubscriptions = (symbols: string[]) =>
    symbols.map((symbol) => instance.subscribe([eventType], [symbol], () => 0))

  beforeEach(() => {
    jest.useFakeTimers()
    instance = new Feed()
  })

  it('should unsubscribe crossing subscriptions correctly', () => {
    const publishFirstTime = jest.fn()
    instance.endpoint.updateSubscriptions = publishFirstTime

    const unsubscribe1 = createSubscription(symbolsSet1)

    const unsubscribe2 = createSubscription(symbolsSet2)

    jest.runAllTimers()

    const publishSecondTime = jest.fn()
    instance.endpoint.updateSubscriptions = publishSecondTime

    unsubscribe2()

    jest.runAllTimers()

    const publishThirdTime = jest.fn()
    instance.endpoint.updateSubscriptions = publishThirdTime

    unsubscribe1()

    jest.runAllTimers()

    expect(publishFirstTime).toBeCalledTimes(1)
    expect(publishFirstTime).toBeCalledWith({ add: { [eventType]: symbolsSet1 } })

    expect(publishSecondTime).toBeCalledTimes(0)

    expect(publishThirdTime).toBeCalledTimes(1)
    expect(publishThirdTime).toBeCalledWith({
      remove: { [eventType]: symbolsSet1 },
    })
  })

  it('should remove and add correctly in 1 tick', () => {
    const publishFirstTime = jest.fn()
    instance.endpoint.updateSubscriptions = publishFirstTime

    const unsubscribeSet1 = createMultipleSubscriptions(symbolsSet1)

    jest.runAllTimers()

    const publishSecondTime = jest.fn()
    instance.endpoint.updateSubscriptions = publishSecondTime

    unsubscribeSet1.forEach((unsubscribe) => {
      unsubscribe()
    })

    createMultipleSubscriptions(symbolsSet2)

    jest.runAllTimers()

    expect(publishFirstTime).toBeCalledTimes(1)
    expect(publishFirstTime).toBeCalledWith({ add: { [eventType]: symbolsSet1 } })

    expect(publishSecondTime).toBeCalledTimes(1)
    expect(publishSecondTime).toBeCalledWith({
      add: { [eventType]: symbolsSet2 },
      remove: { [eventType]: ['1', '4'] },
    })
  })

  it('should remove and add correctly in different ticks', () => {
    const publishFirstTime = jest.fn()
    instance.endpoint.updateSubscriptions = publishFirstTime

    const unsubscribeSet1 = createMultipleSubscriptions(symbolsSet1)

    jest.runAllTimers()

    const publishSecondTime = jest.fn()
    instance.endpoint.updateSubscriptions = publishSecondTime

    unsubscribeSet1.forEach((unsubscribe) => {
      unsubscribe()
    })

    jest.runAllTimers()

    const publishThirdTime = jest.fn()
    instance.endpoint.updateSubscriptions = publishThirdTime

    createMultipleSubscriptions(symbolsSet2)

    jest.runAllTimers()

    expect(publishFirstTime).toBeCalledTimes(1)
    expect(publishFirstTime).toBeCalledWith({ add: { [eventType]: symbolsSet1 } })

    expect(publishSecondTime).toBeCalledTimes(1)
    expect(publishSecondTime).toBeCalledWith({
      remove: { [eventType]: symbolsSet1 },
    })

    expect(publishThirdTime).toBeCalledTimes(1)
    expect(publishThirdTime).toBeCalledWith({
      add: { [eventType]: symbolsSet2 },
    })
  })
})

describe('Feed - subscriptions time series', () => {
  let instance: Feed

  const eventType = EventType.Candle
  const symbolsSet1 = ['1', '2']
  const symbolsSet2 = ['2', '3', '4', '5']
  const symbolsSet3 = ['3', '4']

  const createSubscriptionTimeSeries = (symbols: string[], fromTime?: number) =>
    instance.subscribeTimeSeries([eventType], symbols, () => 0, fromTime)

  beforeEach(() => {
    jest.useFakeTimers()
    instance = new Feed()
  })

  it('should unsubscribe crossing subscriptions correctly', () => {
    const publishFirstTime = jest.fn()
    instance.endpoint.updateSubscriptions = publishFirstTime

    const fromTime2 = 1000
    const fromTime3 = 10

    const unsubscribe1 = createSubscriptionTimeSeries(symbolsSet1)

    const unsubscribe2 = createSubscriptionTimeSeries(symbolsSet2, fromTime2)

    const unsubscribe3 = createSubscriptionTimeSeries(symbolsSet3, fromTime3)

    jest.runAllTimers()

    const publishSecondTime = jest.fn()
    instance.endpoint.updateSubscriptions = publishSecondTime

    unsubscribe3()

    jest.runAllTimers()

    const publishThirdTime = jest.fn()
    instance.endpoint.updateSubscriptions = publishThirdTime

    unsubscribe2()

    jest.runAllTimers()

    const publishFourthTime = jest.fn()
    instance.endpoint.updateSubscriptions = publishFourthTime

    unsubscribe1()

    jest.runAllTimers()

    expect(publishFirstTime).toBeCalledTimes(1)
    expect(publishFirstTime).toBeCalledWith({
      addTimeSeries: {
        [eventType]: [
          { eventSymbol: '1' },
          { eventSymbol: '2', fromTime: fromTime2 },
          { eventSymbol: '3', fromTime: fromTime3 },
          { eventSymbol: '4', fromTime: fromTime3 },
          { eventSymbol: '5', fromTime: fromTime2 },
        ],
      },
    })

    expect(publishSecondTime).toBeCalledTimes(1)
    expect(publishSecondTime).toBeCalledWith({
      addTimeSeries: {
        [eventType]: [
          { eventSymbol: '3', fromTime: fromTime2 },
          { eventSymbol: '4', fromTime: fromTime2 },
        ],
      },
    })

    expect(publishThirdTime).toBeCalledTimes(1)
    expect(publishThirdTime).toBeCalledWith({
      addTimeSeries: {
        [eventType]: [{ eventSymbol: '2' }],
      },
      removeTimeSeries: { [eventType]: ['3', '4', '5'] },
    })

    expect(publishFourthTime).toBeCalledTimes(1)
    expect(publishFourthTime).toBeCalledWith({
      removeTimeSeries: { [eventType]: symbolsSet1 },
    })
  })
})
