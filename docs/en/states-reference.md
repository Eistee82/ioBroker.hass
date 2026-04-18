# States Reference

Auto-generated from `src/lib/state-definitions.ts`. Use `/sync-docs` to regenerate.

## light

| State | Type | Role | Read | Write | Unit | Description |
|-------|------|------|------|-------|------|-------------|
| ON_SET | boolean | switch.light | false | true |  | Turn light on/off. |
| ON_ACTUAL | boolean | sensor.light | true | false |  | Current on/off state from HASS. |

## dimmer

| State | Type | Role | Read | Write | Unit | Description |
|-------|------|------|------|-------|------|-------------|
| SET | number | level.dimmer | false | true | % | Set brightness in percent. |
| ACTUAL | number | value.dimmer | true | false | % | Current brightness. |
| ON_SET | boolean | switch.light | false | true |  | Turn on/off. |
| ON_ACTUAL | boolean | sensor.light | true | false |  | Current on/off state. |

## rgb

| State | Type | Role | Read | Write | Unit | Description |
|-------|------|------|------|-------|------|-------------|
| RGB | string | level.color.rgb | true | true |  | Colour as #rrggbb hex. |
| DIMMER | number | level.dimmer | true | true | % | Brightness in percent. |
| ON_SET | boolean | switch.light | false | true |  | Turn on/off. |
| ON_ACTUAL | boolean | sensor.light | true | false |  | Current on/off state. |

## socket

| State | Type | Role | Read | Write | Unit | Description |
|-------|------|------|------|-------|------|-------------|
| SET | boolean | switch | false | true |  | Switch socket. |
| ACTUAL | boolean | indicator | true | false |  | Current on/off state. |
| ELECTRIC_POWER | number | value.power | true | false | W | Instantaneous power draw. |

## thermostat

| State | Type | Role | Read | Write | Unit | Description |
|-------|------|------|------|-------|------|-------------|
| SET | number | level.temperature | true | true | °C | Target temperature. |
| ACTUAL | number | value.temperature | true | false | °C | Current temperature. |
| MODE | string | level.mode.thermostat | true | true |  | HVAC mode (heat/cool/auto/off). |
| HUMIDITY | number | value.humidity | true | false | % | Current humidity. |

## blind

| State | Type | Role | Read | Write | Unit | Description |
|-------|------|------|------|-------|------|-------------|
| SET | number | level.blind | true | true | % | Target open position. |
| ACTUAL | number | value.blind | true | false | % | Current open position. |
| STOP | boolean | button.press | false | true |  | Stop movement. |
| TILT_SET | number | level.tilt | true | true | % | Target tilt. |

## window

| State | Type | Role | Read | Write | Unit | Description |
|-------|------|------|------|-------|------|-------------|
| ACTUAL | boolean | sensor.window | true | false |  | Window open/closed. |

## door

| State | Type | Role | Read | Write | Unit | Description |
|-------|------|------|------|-------|------|-------------|
| ACTUAL | boolean | sensor.door | true | false |  | Door open/closed. |

## motion

| State | Type | Role | Read | Write | Unit | Description |
|-------|------|------|------|-------|------|-------------|
| ACTUAL | boolean | sensor.motion | true | false |  | Motion detected. |

## temperature

| State | Type | Role | Read | Write | Unit | Description |
|-------|------|------|------|-------|------|-------------|
| ACTUAL | number | value.temperature | true | false | °C | Temperature reading. |

## humidity

| State | Type | Role | Read | Write | Unit | Description |
|-------|------|------|------|-------|------|-------------|
| ACTUAL | number | value.humidity | true | false | % | Humidity reading. |

## media

| State | Type | Role | Read | Write | Unit | Description |
|-------|------|------|------|-------|------|-------------|
| STATE | string | media.state | true | true |  | Playback state (playing/paused/idle). |
| PLAY | boolean | media.play | false | true |  | Play. |
| PAUSE | boolean | media.pause | false | true |  | Pause. |
| STOP | boolean | media.stop | false | true |  | Stop. |
| NEXT | boolean | media.next | false | true |  | Next track. |
| PREVIOUS | boolean | media.previous | false | true |  | Previous track. |
| VOLUME | number | level.volume | true | true | % | Volume percent. |
| MUTE | boolean | media.mute | true | true |  | Mute toggle. |
| ARTIST | string | media.artist | true | false |  | Current artist. |
| TITLE | string | media.title | true | false |  | Current title. |

## vacuum

| State | Type | Role | Read | Write | Unit | Description |
|-------|------|------|------|-------|------|-------------|
| POWER | boolean | switch.power | true | true |  | Start/stop the vacuum. |
| BATTERY | number | value.battery | true | false | % | Battery percent. |
| STATE | string | media.state | true | false |  | Current vacuum state. |

## lock

| State | Type | Role | Read | Write | Unit | Description |
|-------|------|------|------|-------|------|-------------|
| SET | boolean | switch.lock | true | true |  | Lock/unlock. |
| ACTUAL | boolean | indicator | true | false |  | Current locked state. |

## button

| State | Type | Role | Read | Write | Unit | Description |
|-------|------|------|------|-------|------|-------------|
| PRESS | boolean | button.press | false | true |  | Trigger a button press. |

