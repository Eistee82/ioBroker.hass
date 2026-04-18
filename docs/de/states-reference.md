# States-Referenz

Automatisch generiert aus `src/lib/state-definitions.ts`. Regenerierung: `/sync-docs`.

## light

| State | Typ | Rolle | Lesen | Schreiben | Einheit | Beschreibung |
|-------|-----|-------|-------|-----------|---------|--------------|
| ON_SET | boolean | switch.light | false | true |  | Lampe an/aus schalten. |
| ON_ACTUAL | boolean | sensor.light | true | false |  | Aktueller On/Off-Zustand von HASS. |

## dimmer

| State | Typ | Rolle | Lesen | Schreiben | Einheit | Beschreibung |
|-------|-----|-------|-------|-----------|---------|--------------|
| SET | number | level.dimmer | false | true | % | Helligkeit in Prozent setzen. |
| ACTUAL | number | value.dimmer | true | false | % | Aktuelle Helligkeit. |
| ON_SET | boolean | switch.light | false | true |  | An/aus schalten. |
| ON_ACTUAL | boolean | sensor.light | true | false |  | Aktueller On/Off-Zustand. |

## rgb

| State | Typ | Rolle | Lesen | Schreiben | Einheit | Beschreibung |
|-------|-----|-------|-------|-----------|---------|--------------|
| RGB | string | level.color.rgb | true | true |  | Farbe als #rrggbb-Hex. |
| DIMMER | number | level.dimmer | true | true | % | Helligkeit in Prozent. |
| ON_SET | boolean | switch.light | false | true |  | An/aus schalten. |
| ON_ACTUAL | boolean | sensor.light | true | false |  | Aktueller On/Off-Zustand. |

## socket

| State | Typ | Rolle | Lesen | Schreiben | Einheit | Beschreibung |
|-------|-----|-------|-------|-----------|---------|--------------|
| SET | boolean | switch | false | true |  | Steckdose schalten. |
| ACTUAL | boolean | indicator | true | false |  | Aktueller On/Off-Zustand. |
| ELECTRIC_POWER | number | value.power | true | false | W | Momentanleistung. |

## thermostat

| State | Typ | Rolle | Lesen | Schreiben | Einheit | Beschreibung |
|-------|-----|-------|-------|-----------|---------|--------------|
| SET | number | level.temperature | true | true | °C | Soll-Temperatur. |
| ACTUAL | number | value.temperature | true | false | °C | Ist-Temperatur. |
| MODE | string | level.mode.thermostat | true | true |  | HVAC-Modus (heat/cool/auto/off). |
| HUMIDITY | number | value.humidity | true | false | % | Aktuelle Luftfeuchtigkeit. |

## blind

| State | Typ | Rolle | Lesen | Schreiben | Einheit | Beschreibung |
|-------|-----|-------|-------|-----------|---------|--------------|
| SET | number | level.blind | true | true | % | Zielposition geöffnet in Prozent. |
| ACTUAL | number | value.blind | true | false | % | Aktuelle Position. |
| STOP | boolean | button.press | false | true |  | Fahrt stoppen. |
| TILT_SET | number | level.tilt | true | true | % | Ziel-Neigung. |

## window

| State | Typ | Rolle | Lesen | Schreiben | Einheit | Beschreibung |
|-------|-----|-------|-------|-----------|---------|--------------|
| ACTUAL | boolean | sensor.window | true | false |  | Fenster auf/zu. |

## door

| State | Typ | Rolle | Lesen | Schreiben | Einheit | Beschreibung |
|-------|-----|-------|-------|-----------|---------|--------------|
| ACTUAL | boolean | sensor.door | true | false |  | Tür auf/zu. |

## motion

| State | Typ | Rolle | Lesen | Schreiben | Einheit | Beschreibung |
|-------|-----|-------|-------|-----------|---------|--------------|
| ACTUAL | boolean | sensor.motion | true | false |  | Bewegung erkannt. |

## temperature

| State | Typ | Rolle | Lesen | Schreiben | Einheit | Beschreibung |
|-------|-----|-------|-------|-----------|---------|--------------|
| ACTUAL | number | value.temperature | true | false | °C | Temperatur-Messwert. |

## humidity

| State | Typ | Rolle | Lesen | Schreiben | Einheit | Beschreibung |
|-------|-----|-------|-------|-----------|---------|--------------|
| ACTUAL | number | value.humidity | true | false | % | Luftfeuchte-Messwert. |

## media

| State | Typ | Rolle | Lesen | Schreiben | Einheit | Beschreibung |
|-------|-----|-------|-------|-----------|---------|--------------|
| STATE | string | media.state | true | true |  | Wiedergabezustand. |
| PLAY | boolean | media.play | false | true |  | Wiedergabe starten. |
| PAUSE | boolean | media.pause | false | true |  | Pausieren. |
| STOP | boolean | media.stop | false | true |  | Stoppen. |
| NEXT | boolean | media.next | false | true |  | Nächster Titel. |
| PREVIOUS | boolean | media.previous | false | true |  | Vorheriger Titel. |
| VOLUME | number | level.volume | true | true | % | Lautstärke in Prozent. |
| MUTE | boolean | media.mute | true | true |  | Stummschaltung. |
| ARTIST | string | media.artist | true | false |  | Aktueller Interpret. |
| TITLE | string | media.title | true | false |  | Aktueller Titel. |

## vacuum

| State | Typ | Rolle | Lesen | Schreiben | Einheit | Beschreibung |
|-------|-----|-------|-------|-----------|---------|--------------|
| POWER | boolean | switch.power | true | true |  | Saugroboter starten/stoppen. |
| BATTERY | number | value.battery | true | false | % | Akku-Ladung. |
| STATE | string | media.state | true | false |  | Aktueller Saugroboter-Zustand. |

## lock

| State | Typ | Rolle | Lesen | Schreiben | Einheit | Beschreibung |
|-------|-----|-------|-------|-----------|---------|--------------|
| SET | boolean | switch.lock | true | true |  | Schließen/öffnen. |
| ACTUAL | boolean | indicator | true | false |  | Aktueller Schließzustand. |

## button

| State | Typ | Rolle | Lesen | Schreiben | Einheit | Beschreibung |
|-------|-----|-------|-------|-----------|---------|--------------|
| PRESS | boolean | button.press | false | true |  | Tastendruck auslösen. |

