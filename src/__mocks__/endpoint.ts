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
