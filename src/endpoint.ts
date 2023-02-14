/** @license
 * Copyright ©2020 Devexperts LLC. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
 * If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { CometD, Configuration, Message } from 'cometd'

import { HEADER_AUTH_TOKEN_KEY } from './config'
import { IFeedImplState, IncomingData, IOnDemandMessage, ISubscribeMessage } from './interfaces'

type StateChangeHandler = (state: Partial<IFeedImplState>) => void

type DataChangeHandler = (message: IncomingData, timeSeries: boolean) => void

export class Endpoint {
  cometd: CometD | null = null
  authToken: string | null = null
  connectionAlive: boolean = false

  handlers: {
    onStateChange?: StateChangeHandler
    onData?: DataChangeHandler
  } = {}

  registerStateChangeHandler = (onStateChange: StateChangeHandler) => {
    this.handlers.onStateChange = onStateChange
  }

  registerDataChangeHandler = (onData: DataChangeHandler) => {
    this.handlers.onData = onData
  }

  private updateConnectedState(connected: boolean) {
    if (this.connectionAlive !== connected) {
      this.connectionAlive = connected
      this.handlers?.onStateChange({ connected })
    }
  }

  private onMetaUpdate = (message: Message) => {
    if (!this.isConnected()) {
      return this.updateConnectedState(false)
    }

    this.updateConnectedState(message.successful)
  }

  private onMetaUnsuccessful = () => {
    this.updateConnectedState(false)
  }

  private onServiceState = (message: Message) => {
    this.handlers?.onStateChange(message.data)
  }

  private onServiceData = (message: Message) => {
    this.handlers?.onData(message.data, false)
  }

  private onServiceTimeSeriesData = (message: Message) => {
    this.handlers?.onData(message.data, true)
  }

  isConnected = () => this.cometd !== null && !this.cometd.isDisconnected()

  connect(config: Configuration) {
    const cometd = this.cometd || this.createCometD()

    cometd.configure(config)

    const authToken = this.authToken
    if (authToken === null) {
      // @ts-ignore cometd types differs from code, need research
      cometd.handshake()
    } else {
      // @ts-ignore cometd types differs from code, need research
      cometd.handshake({ ext: { [HEADER_AUTH_TOKEN_KEY]: authToken } })
    }
  }

  private createCometD = () => {
    const cometd = new CometD()

    cometd.addListener('/meta/handshake', this.onMetaUpdate)
    cometd.addListener('/meta/connect', this.onMetaUpdate)
    cometd.addListener('/meta/unsuccessful', this.onMetaUnsuccessful)
    cometd.addListener('/service/state', this.onServiceState)
    cometd.addListener('/service/data', this.onServiceData)
    cometd.addListener('/service/timeSeriesData', this.onServiceTimeSeriesData)

    this.cometd = cometd
    return cometd
  }

  setAuthToken(token: string) {
    this.authToken = token
  }

  disconnect() {
    if (this.cometd !== null) {
      // @ts-ignore cometd types differs from code, need research
      this.cometd.disconnect(true)
      this.cometd = null
    }
  }

  updateSubscriptions(message: ISubscribeMessage) {
    return this.publish('sub', message)
  }

  invokeOnDemandService(message: IOnDemandMessage) {
    return this.publish('onDemand', message)
  }

  private publish(service: 'sub' | 'onDemand', message: object) {
    if (!this.cometd) {
      throw new Error('CometD not connected')
    }

    return this.cometd.publish('/service/' + service, message)
  }
}
