/** @license
 * Copyright ©2020 Devexperts LLC. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
 * If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/* tslint:disable:no-empty */

type StateChangeHandler = (state: any) => void
type DataChangeHandler = (message: any, state: boolean) => void

export class Endpoint {
  handlers: {
    onStateChange?: StateChangeHandler
    onData?: DataChangeHandler
  } = {}
  mock = true

  constructor() {}

  registerStateChangeHandler = jest.fn((onStateChange: StateChangeHandler) => {
    this.handlers.onStateChange = onStateChange
  })

  registerDataChangeHandler = jest.fn((onData: DataChangeHandler) => {
    this.handlers.onData = onData
  })

  connected = jest.fn(() => true)

  setAuthToken = jest.fn() // (_token: string) {}

  disconnect = jest.fn()

  updateSubscriptions = jest.fn() // (message: ISubscribeMessage) {}
}
