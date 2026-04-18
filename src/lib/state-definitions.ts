/**
 * Type-Detector-konforme Channel-/State-Schemata für den `devices.*`-Zweig.
 *
 * Jedes Schema beschreibt einen logischen ioBroker-Channel, der von der
 * type-detector-Library erkannt wird (benötigt für VIS/Material/iot/iQontrol/Yahka).
 * Eine HASS-Entity wird je nach Domain und Attributen einem dieser Types zugeordnet;
 * die jeweiligen States werden dann unter `devices.<device_id>.<type>.*` angelegt.
 */

export type StateRole =
    | 'switch'
    | 'switch.light'
    | 'switch.power'
    | 'switch.lock'
    | 'level'
    | 'level.dimmer'
    | 'level.temperature'
    | 'level.blind'
    | 'level.tilt'
    | 'level.volume'
    | 'level.color.red'
    | 'level.color.green'
    | 'level.color.blue'
    | 'level.color.rgb'
    | 'level.color.temperature'
    | 'level.mode.thermostat'
    | 'level.mode.fan'
    | 'value'
    | 'value.temperature'
    | 'value.humidity'
    | 'value.power'
    | 'value.power.consumption'
    | 'value.battery'
    | 'value.dimmer'
    | 'value.blind'
    | 'value.tilt'
    | 'indicator'
    | 'indicator.connected'
    | 'indicator.lowbat'
    | 'indicator.working'
    | 'sensor.motion'
    | 'sensor.door'
    | 'sensor.window'
    | 'sensor.alarm.flood'
    | 'sensor.alarm.fire'
    | 'sensor.light'
    | 'media.state'
    | 'media.play'
    | 'media.pause'
    | 'media.stop'
    | 'media.next'
    | 'media.previous'
    | 'media.artist'
    | 'media.title'
    | 'media.mute'
    | 'button'
    | 'button.press'
    | 'text'
    | 'json';

export interface StateSchema {
    id: string;
    type: 'boolean' | 'number' | 'string';
    role: StateRole;
    read: boolean;
    write: boolean;
    unit?: string;
    min?: number;
    max?: number;
    states?: Record<string, string>;
    description: { en: string; de: string };
    /** Mandatory state — device-type-detector requires this. */
    mandatory?: boolean;
}

/**
 * All supported device-types. The ordering is meaningful: the heuristic in
 * DeviceTreeBuilder tries more specific types first (e.g. rgb before dimmer,
 * dimmer before light).
 */
export const DEVICE_TYPES = [
    'rgb',
    'dimmer',
    'light',
    'socket',
    'thermostat',
    'blind',
    'window',
    'door',
    'motion',
    'temperature',
    'humidity',
    'media',
    'vacuum',
    'lock',
    'button',
] as const;

export type DeviceType = (typeof DEVICE_TYPES)[number];

export const DEVICE_TYPE_SCHEMAS: Record<DeviceType, StateSchema[]> = {
    light: [
        {
            id: 'ON_SET',
            type: 'boolean',
            role: 'switch.light',
            read: false,
            write: true,
            mandatory: true,
            description: { en: 'Turn light on/off.', de: 'Lampe an/aus schalten.' },
        },
        {
            id: 'ON_ACTUAL',
            type: 'boolean',
            role: 'sensor.light',
            read: true,
            write: false,
            description: { en: 'Current on/off state from HASS.', de: 'Aktueller On/Off-Zustand von HASS.' },
        },
    ],
    dimmer: [
        {
            id: 'SET',
            type: 'number',
            role: 'level.dimmer',
            read: false,
            write: true,
            unit: '%',
            min: 0,
            max: 100,
            mandatory: true,
            description: { en: 'Set brightness in percent.', de: 'Helligkeit in Prozent setzen.' },
        },
        {
            id: 'ACTUAL',
            type: 'number',
            role: 'value.dimmer',
            read: true,
            write: false,
            unit: '%',
            min: 0,
            max: 100,
            description: { en: 'Current brightness.', de: 'Aktuelle Helligkeit.' },
        },
        {
            id: 'ON_SET',
            type: 'boolean',
            role: 'switch.light',
            read: false,
            write: true,
            description: { en: 'Turn on/off.', de: 'An/aus schalten.' },
        },
        {
            id: 'ON_ACTUAL',
            type: 'boolean',
            role: 'sensor.light',
            read: true,
            write: false,
            description: { en: 'Current on/off state.', de: 'Aktueller On/Off-Zustand.' },
        },
    ],
    rgb: [
        {
            id: 'RGB',
            type: 'string',
            role: 'level.color.rgb',
            read: true,
            write: true,
            mandatory: true,
            description: { en: 'Colour as #rrggbb hex.', de: 'Farbe als #rrggbb-Hex.' },
        },
        {
            id: 'DIMMER',
            type: 'number',
            role: 'level.dimmer',
            read: true,
            write: true,
            unit: '%',
            min: 0,
            max: 100,
            description: { en: 'Brightness in percent.', de: 'Helligkeit in Prozent.' },
        },
        {
            id: 'ON_SET',
            type: 'boolean',
            role: 'switch.light',
            read: false,
            write: true,
            description: { en: 'Turn on/off.', de: 'An/aus schalten.' },
        },
        {
            id: 'ON_ACTUAL',
            type: 'boolean',
            role: 'sensor.light',
            read: true,
            write: false,
            description: { en: 'Current on/off state.', de: 'Aktueller On/Off-Zustand.' },
        },
    ],
    socket: [
        {
            id: 'SET',
            type: 'boolean',
            role: 'switch',
            read: false,
            write: true,
            mandatory: true,
            description: { en: 'Switch socket.', de: 'Steckdose schalten.' },
        },
        {
            id: 'ACTUAL',
            type: 'boolean',
            role: 'indicator',
            read: true,
            write: false,
            description: { en: 'Current on/off state.', de: 'Aktueller On/Off-Zustand.' },
        },
        {
            id: 'ELECTRIC_POWER',
            type: 'number',
            role: 'value.power',
            read: true,
            write: false,
            unit: 'W',
            description: { en: 'Instantaneous power draw.', de: 'Momentanleistung.' },
        },
    ],
    thermostat: [
        {
            id: 'SET',
            type: 'number',
            role: 'level.temperature',
            read: true,
            write: true,
            unit: '°C',
            mandatory: true,
            description: { en: 'Target temperature.', de: 'Soll-Temperatur.' },
        },
        {
            id: 'ACTUAL',
            type: 'number',
            role: 'value.temperature',
            read: true,
            write: false,
            unit: '°C',
            description: { en: 'Current temperature.', de: 'Ist-Temperatur.' },
        },
        {
            id: 'MODE',
            type: 'string',
            role: 'level.mode.thermostat',
            read: true,
            write: true,
            description: { en: 'HVAC mode (heat/cool/auto/off).', de: 'HVAC-Modus (heat/cool/auto/off).' },
        },
        {
            id: 'HUMIDITY',
            type: 'number',
            role: 'value.humidity',
            read: true,
            write: false,
            unit: '%',
            description: { en: 'Current humidity.', de: 'Aktuelle Luftfeuchtigkeit.' },
        },
    ],
    blind: [
        {
            id: 'SET',
            type: 'number',
            role: 'level.blind',
            read: true,
            write: true,
            unit: '%',
            min: 0,
            max: 100,
            mandatory: true,
            description: { en: 'Target open position.', de: 'Zielposition geöffnet in Prozent.' },
        },
        {
            id: 'ACTUAL',
            type: 'number',
            role: 'value.blind',
            read: true,
            write: false,
            unit: '%',
            min: 0,
            max: 100,
            description: { en: 'Current open position.', de: 'Aktuelle Position.' },
        },
        {
            id: 'STOP',
            type: 'boolean',
            role: 'button.press',
            read: false,
            write: true,
            description: { en: 'Stop movement.', de: 'Fahrt stoppen.' },
        },
        {
            id: 'TILT_SET',
            type: 'number',
            role: 'level.tilt',
            read: true,
            write: true,
            unit: '%',
            description: { en: 'Target tilt.', de: 'Ziel-Neigung.' },
        },
    ],
    window: [
        {
            id: 'ACTUAL',
            type: 'boolean',
            role: 'sensor.window',
            read: true,
            write: false,
            mandatory: true,
            description: { en: 'Window open/closed.', de: 'Fenster auf/zu.' },
        },
    ],
    door: [
        {
            id: 'ACTUAL',
            type: 'boolean',
            role: 'sensor.door',
            read: true,
            write: false,
            mandatory: true,
            description: { en: 'Door open/closed.', de: 'Tür auf/zu.' },
        },
    ],
    motion: [
        {
            id: 'ACTUAL',
            type: 'boolean',
            role: 'sensor.motion',
            read: true,
            write: false,
            mandatory: true,
            description: { en: 'Motion detected.', de: 'Bewegung erkannt.' },
        },
    ],
    temperature: [
        {
            id: 'ACTUAL',
            type: 'number',
            role: 'value.temperature',
            read: true,
            write: false,
            unit: '°C',
            mandatory: true,
            description: { en: 'Temperature reading.', de: 'Temperatur-Messwert.' },
        },
    ],
    humidity: [
        {
            id: 'ACTUAL',
            type: 'number',
            role: 'value.humidity',
            read: true,
            write: false,
            unit: '%',
            mandatory: true,
            description: { en: 'Humidity reading.', de: 'Luftfeuchte-Messwert.' },
        },
    ],
    media: [
        {
            id: 'STATE',
            type: 'string',
            role: 'media.state',
            read: true,
            write: true,
            mandatory: true,
            description: { en: 'Playback state (playing/paused/idle).', de: 'Wiedergabezustand.' },
        },
        {
            id: 'PLAY',
            type: 'boolean',
            role: 'media.play',
            read: false,
            write: true,
            description: { en: 'Play.', de: 'Wiedergabe starten.' },
        },
        {
            id: 'PAUSE',
            type: 'boolean',
            role: 'media.pause',
            read: false,
            write: true,
            description: { en: 'Pause.', de: 'Pausieren.' },
        },
        {
            id: 'STOP',
            type: 'boolean',
            role: 'media.stop',
            read: false,
            write: true,
            description: { en: 'Stop.', de: 'Stoppen.' },
        },
        {
            id: 'NEXT',
            type: 'boolean',
            role: 'media.next',
            read: false,
            write: true,
            description: { en: 'Next track.', de: 'Nächster Titel.' },
        },
        {
            id: 'PREVIOUS',
            type: 'boolean',
            role: 'media.previous',
            read: false,
            write: true,
            description: { en: 'Previous track.', de: 'Vorheriger Titel.' },
        },
        {
            id: 'VOLUME',
            type: 'number',
            role: 'level.volume',
            read: true,
            write: true,
            unit: '%',
            min: 0,
            max: 100,
            description: { en: 'Volume percent.', de: 'Lautstärke in Prozent.' },
        },
        {
            id: 'MUTE',
            type: 'boolean',
            role: 'media.mute',
            read: true,
            write: true,
            description: { en: 'Mute toggle.', de: 'Stummschaltung.' },
        },
        {
            id: 'ARTIST',
            type: 'string',
            role: 'media.artist',
            read: true,
            write: false,
            description: { en: 'Current artist.', de: 'Aktueller Interpret.' },
        },
        {
            id: 'TITLE',
            type: 'string',
            role: 'media.title',
            read: true,
            write: false,
            description: { en: 'Current title.', de: 'Aktueller Titel.' },
        },
    ],
    vacuum: [
        {
            id: 'POWER',
            type: 'boolean',
            role: 'switch.power',
            read: true,
            write: true,
            mandatory: true,
            description: { en: 'Start/stop the vacuum.', de: 'Saugroboter starten/stoppen.' },
        },
        {
            id: 'BATTERY',
            type: 'number',
            role: 'value.battery',
            read: true,
            write: false,
            unit: '%',
            description: { en: 'Battery percent.', de: 'Akku-Ladung.' },
        },
        {
            id: 'STATE',
            type: 'string',
            role: 'media.state',
            read: true,
            write: false,
            description: { en: 'Current vacuum state.', de: 'Aktueller Saugroboter-Zustand.' },
        },
    ],
    lock: [
        {
            id: 'SET',
            type: 'boolean',
            role: 'switch.lock',
            read: true,
            write: true,
            mandatory: true,
            description: { en: 'Lock/unlock.', de: 'Schließen/öffnen.' },
        },
        {
            id: 'ACTUAL',
            type: 'boolean',
            role: 'indicator',
            read: true,
            write: false,
            description: { en: 'Current locked state.', de: 'Aktueller Schließzustand.' },
        },
    ],
    button: [
        {
            id: 'PRESS',
            type: 'boolean',
            role: 'button.press',
            read: false,
            write: true,
            mandatory: true,
            description: { en: 'Trigger a button press.', de: 'Tastendruck auslösen.' },
        },
    ],
};

/** Quick lookup: mandatory states per device-type. */
export function mandatoryStatesFor(type: DeviceType): StateSchema[] {
    return (DEVICE_TYPE_SCHEMAS[type] ?? []).filter(s => s.mandatory);
}

/** Complete schema-list for a device-type, or empty array for unknown. */
export function schemaFor(type: DeviceType): StateSchema[] {
    return DEVICE_TYPE_SCHEMAS[type] ?? [];
}
