/** @license
 * Copyright ©2020 Devexperts LLC. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
 * If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/* tslint:disable:file-name-casing */
import * as React from 'react'
import { Helmet } from 'react-helmet-async'

import { createMuiTheme, ThemeProvider } from '@material-ui/core/styles'
import { useColorMode } from 'theme-ui'

// The doc prop contains some metadata about the page being rendered that you can use.
const Wrapper: React.FunctionComponent = ({ children }) => {
  const [colorMode] = useColorMode()
  const theme = React.useMemo(
    () =>
      createMuiTheme({
        palette: {
          type: colorMode as 'light' | 'dark',
        },
      }),
    [colorMode]
  )

  return (
    <ThemeProvider theme={theme}>
      <Helmet>
        <meta charSet="utf-8" />
        <link rel="icon" type="image/png" href="/public/favicon.ico" />
      </Helmet>
      {children}
    </ThemeProvider>
  )
}

export default Wrapper
