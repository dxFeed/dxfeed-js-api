/** @license
 * Copyright ©2020 Devexperts LLC. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
 * If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React from 'react'
import { Inspector } from 'react-inspector'

import Button from '@material-ui/core/Button'
import FormControl from '@material-ui/core/FormControl'
import FormControlLabel from '@material-ui/core/FormControlLabel'
import FormLabel from '@material-ui/core/FormLabel'
import Grid from '@material-ui/core/Grid'
import Radio from '@material-ui/core/Radio'
import RadioGroup from '@material-ui/core/RadioGroup'
import { useComponents } from 'docz'

import Feed, { EventType } from '../../src'

const SYMBOLS = ['ETH/USD', 'EUR/USD'] as const

const DataViewer = ({ play, events }: { play: boolean; events: unknown[] }) =>
  (play || events.length > 0) && (
    <Grid style={{ marginTop: 5 }} container spacing={3}>
      {events.length === 0 && <Grid item>Waiting events</Grid>}
      {events.map((event, idx) => (
        <Grid key={idx} item>
          <Inspector data={event} />
        </Grid>
      ))}
    </Grid>
  )

function Playground() {
  const { playground, pre, h2 } = useComponents()
  const PlaygroundComponent = playground as React.FunctionComponent<{
    scope: Record<string, any>
    language: string
    code: string
  }>
  const PreComponent = pre as React.FunctionComponent<{}>
  const H2Component = h2 as React.FunctionComponent<{}>

  const feedRef = React.useRef<Feed | null>(null)
  const [type, setType] = React.useState<'series' | 'timeSeries'>('series')
  const [eventType, setEventType] = React.useState<EventType>(EventType.Trade)
  const [symbolName, setSymbolName] = React.useState<string>(SYMBOLS[0])

  const feed = React.useMemo(() => new Feed(), [])

  React.useEffect(() => {
    feed.connect('wss://tools.dxfeed.com/webservice/cometd')

    return () => feed.disconnect()
  }, [])

  return (
    <>
      <H2Component>Configure</H2Component>

      <Grid container spacing={3}>
        <Grid item lg={4} md={12} xs={12}>
          <FormControl component="fieldset">
            <FormLabel component="legend">Select type</FormLabel>
            <RadioGroup
              aria-label="type"
              name="type"
              value={type}
              onChange={(event) => {
                setType(event.target.value as any)
              }}
            >
              <FormControlLabel value="series" control={<Radio />} label="Series" />
              <FormControlLabel value="timeSeries" control={<Radio />} label="Time Series" />
            </RadioGroup>
          </FormControl>
        </Grid>

        <Grid item lg={4} md={6} xs={12}>
          <FormControl component="fieldset">
            <FormLabel component="legend">Select Event Type</FormLabel>
            <RadioGroup
              aria-label="eventType"
              name="eventType"
              value={eventType}
              onChange={(event) => {
                setEventType(event.target.value as any)
              }}
            >
              {Object.keys(EventType).map((key) => {
                const value = key as EventType

                return (
                  <FormControlLabel key={value} value={value} control={<Radio />} label={value} />
                )
              })}
            </RadioGroup>
          </FormControl>
        </Grid>

        <Grid item lg={4} md={6} xs={12}>
          <FormControl component="fieldset">
            <FormLabel component="legend">Select Symbol Name</FormLabel>
            <RadioGroup
              aria-label="symbolName"
              name="symbolName"
              value={symbolName}
              onChange={(event) => {
                setSymbolName(event.target.value as any)
              }}
            >
              {SYMBOLS.map((value) => (
                <FormControlLabel key={value} value={value} control={<Radio />} label={value} />
              ))}
            </RadioGroup>
          </FormControl>
        </Grid>
      </Grid>

      <H2Component>Example</H2Component>
      <PreComponent>
        Example demonstrates how to work with it in <b>React</b>
      </PreComponent>

      <PlaygroundComponent
        scope={{
          Feed: class extends Feed {
            constructor() {
              super()

              this.subscriptions = feed.subscriptions
              this.endpoint = feed.endpoint

              this.connect = () => 0
              this.disconnect = () => 0
            }
          },
          Button,
          DataViewer,
        }}
        language="js"
        code={`() => {
  const [play, setPlay] = React.useState(false)
  const [events, setEvents] = React.useState([])
  const handleEvent = React.useCallback((event) => {
    setEvents((prevState) => [...prevState, event])
  }, [])

  const feed = React.useMemo(() => new Feed(), [])
  React.useEffect(() => {
    feed.connect('wss://tools.dxfeed.com/webservice/cometd')
    return () => feed.disconnect()
  }, [])

  React.useEffect(() => {
    let unsubscribe
    if (play) {
      setEvents([])
      unsubscribe = feed.${
        type === 'series'
          ? `subscribe(['${eventType}'], ['${symbolName}'], handleEvent)`
          : `subscribeTimeSeries(['${eventType}'], ['${symbolName}'], 0, handleEvent)`
      }
    }
    return () => unsubscribe && unsubscribe()
  }, [play])

  return (
    <>
      <Button variant="outlined" onClick={() => setPlay(!play)}>
        {play ? 'Stop' : 'Start'}
      </Button>
      <DataViewer play={play} events={events} />
    </>
  )
}`}
      />
    </>
  )
}

export default Playground
