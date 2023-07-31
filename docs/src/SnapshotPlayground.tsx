/** @license
 * Copyright ©2022 Devexperts LLC. All rights reserved.
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
import Input from '@material-ui/core/Input'
import { useComponents } from 'docz'

import Feed, { EventType } from '../../src'

const SYMBOLS = ['AAPL', 'GOOG'] as const

const minusDay = (date: Date, days: number): Date => {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000)
}

const DataViewer = ({ events }: { events: unknown[] }) =>
  events.length > 0 && (
    <Grid style={{ marginTop: 5 }} container spacing={3}>
      {events.slice(0, Math.min(10, events.length)).map((event, idx) => (
        <Grid key={idx} item>
          <Inspector data={event} />
        </Grid>
      ))}
      <Grid item>Only displaying 10 events, total: {events.length}</Grid>
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

  const [eventType, setEventType] = React.useState<EventType>(EventType.Candle)
  const [symbolName, setSymbolName] = React.useState<string>(SYMBOLS[0])
  const [days, setDays] = React.useState<number>(5)

  const feed = React.useMemo(() => new Feed(), [])

  React.useEffect(() => {
    feed.connect('wss://demo.dxfeed.com/webservice/cometd')

    return () => feed.disconnect()
  }, [])

  return (
    <>
      <H2Component>Configure</H2Component>

      <Grid container spacing={3}>
        <Grid item lg={4} md={12} xs={12}>
          <FormControl component="fieldset">
            <FormLabel component="legend">Select type</FormLabel>
            <RadioGroup aria-label="type" name="type" value={'timeSeries'} onChange={() => {}}>
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

        <Grid item lg={4} md={6} xs={12}>
          <FormControl component="div">
            <FormLabel component="label">Period in days</FormLabel>
            <Input
              aria-label="periodInDays"
              name="Period in days"
              value={days}
              onChange={(event) => {
                const value = event.target.value
                setDays(value.length ? parseInt(value, 10) : 0)
              }}
            />
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
   const [events, setEvents] = React.useState([])
 
   const feed = React.useMemo(() => new Feed(), [])
   React.useEffect(() => {
     feed.connect('wss://demo.dxfeed.com/webservice/cometd')
     return () => feed.disconnect()
   }, [])
   
   const subscriptionRef = React.useRef()
   const subscribe = () => {
     // Clear
     subscriptionRef.current && subscriptionRef.current.unsubscribe()
     setEvents([])

     // Subscribe
     subscriptionRef.current = feed.subscribeTimeSeriesSnapshot(
       '${symbolName}${eventType === EventType.Candle ? '{=d}' : ''}',
       '${eventType}',
       ${minusDay(new Date(), days).getTime()},
       (snapshot) => {
        setEvents(snapshot)
       }
     )
   }
 
   return (
     <>
       <Button variant="outlined" onClick={subscribe}>
         Subscribe
       </Button>
       <DataViewer events={events} />
     </>
   )
 }`}
      />
    </>
  )
}

export default Playground
