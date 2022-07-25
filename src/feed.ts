/** @license
 * Copyright ©2020 Devexperts LLC. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
 * If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Endpoint } from './endpoint'
import { EventType, IEvent, ITimeSeriesEvent } from './interfaces'
import { Subscriptions } from './subscriptions'

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
    fromTime: number | undefined,
    onChange: (event: TEvent) => void
  ) => this.subscriptions.subscribeTimeSeries(eventTypes, eventSymbols, fromTime, onChange)
}

export default Feed
