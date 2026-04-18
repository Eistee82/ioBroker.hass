![Logo](../../admin/hass.png)

# ioBroker.hass v3 — Documentation

ioBroker.hass v3 connects ioBroker to an external Home Assistant installation over the native WebSocket API. It mirrors HASS entities into the ioBroker object tree, turns ioBroker state writes into HASS service calls, and follows the ioBroker device / channel / state / role conventions so that VIS, Material, Alexa, iQontrol and Yahka can pick devices up out of the box.

## Table of Contents

- [Getting Started](#getting-started)
- [Object Trees](#object-trees)
- [Configuration Tabs](#configuration-tabs)
- [States Reference](./states-reference.md)
- [Recipes](#recipes)
- [Performance Tuning](#performance-tuning)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [Glossary](#glossary)

## Requirements

- ioBroker js-controller ≥ 6.0.11
- Node.js ≥ 20 (LTS recommended)
- Home Assistant Core ≥ **2024.4** (the compressed `subscribe_entities` stream and registry update events are required)
- A Long-Lived Access Token of an admin user in your HASS instance

## Getting Started

### 1. Install the adapter

Install `ioBroker.hass` from the ioBroker repository or directly from GitHub. Create a new instance `hass.0`.

### 2. Create a Long-Lived Access Token

1. In Home Assistant, click your user avatar (bottom left).
2. Open **Profile → Security → Long-Lived Access Tokens**.
3. Click **Create Token**, give it a name (e.g. `ioBroker`) and copy the token.

The token is valid for 10 years. Keep it secret — the adapter stores it encrypted.

### 3. Configure the adapter

Open the `hass.0` settings in ioBroker Admin.

- **Verbindung / Connection**
  - Host: IP or hostname of your HASS instance
  - Port: 8123 (unless a reverse proxy uses another port)
  - HTTPS/WSS: only when HASS is behind TLS
  - Access Token: paste the token from step 2
  - *(Expert)* Self-signed certificates: enable only in trusted LANs
- **Test Connection** — should return the HASS core version.

### 4. Choose trees

- **Objects** tab
  - `devices.*` tree: recommended default. Type-detector-conform, needed for Alexa/VIS/Material.
  - `entities.*` tree: opt-in mirror of every HASS entity. Useful for scripts that want to see HASS attributes directly.

### 5. Narrow the scope

HASS often exposes hundreds of entities (router diagnostics, update sensors, etc.). Go to the **Selection** tab and deselect whatever you do not need in ioBroker.

### 6. Assign rooms and functions

In the **Assignment** tab, match your devices to existing `enum.rooms.*` and `enum.functions.*`. We never create new enums on your behalf.

## Object Trees

### `devices.*` — type-detector-conform

```
hass.0.devices.<device_id>                     type=device
               ├── light / dimmer / rgb        type=channel (detected type)
               │    ├── ON_SET                 role=switch.light
               │    ├── ON_ACTUAL              role=sensor.light
               │    ├── DIMMER / RGB
               │    └── ACTUAL / SET
               └── <other channel per entity>
```

Full schema per type: see [States Reference](./states-reference.md).

### `entities.*` — raw HASS mirror (opt-in)

```
hass.0.entities.<domain>.<entity_id>   type=channel
                          ├── state
                          ├── <attr_1>
                          └── <attr_n>
```

`.state` is the primary write-point; attributes land alongside with roles picked via the built-in `role-mapper` heuristic.

## Configuration Tabs

| Tab | Purpose |
|-----|---------|
| Connection | Host, port, token, TLS, self-signed certs (expert). |
| Objects | Tree toggles, debounce/coalesce/timeouts (expert). |
| Selection | Device/entity filter; glob patterns in expert mode. |
| Assignment | Match HASS areas to ioBroker rooms/functions. |
| Mapping | Override auto-detected device types per entity. |
| Diagnostics | Connection status, statistics, manual service calls, force sync. |

## Recipes

### Alexa integration
1. Enable `devices.*` tree.
2. Assign rooms + functions in the **Assignment** tab.
3. Add the `iot` adapter; select the devices to expose.

### RGB light from click to HASS
When you write a hex value (`#ff8800`) to `devices.<id>.rgb.RGB`, the adapter decodes it to `[r, g, b]` and issues `light.turn_on` with `rgb_color`.

### Energy monitoring with high update frequency
Use a debounce override in the **Objects** tab: pattern `sensor.energy_*`, interval `500` ms.

## Performance Tuning

| Scenario | Recommended defaults |
|----------|---------------------|
| Normal home automation | debounce 50 ms, coalesce 30 ms |
| Dimmer sliders in VIS | coalesce 30–50 ms |
| Energy sensors (≥10 Hz) | debounce 500 ms per-entity override |

`p95` state-roundtrip should stay under **100 ms** on a typical LAN setup.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `connection_lost` loop | Wrong host/port or HASS unreachable | `Test connection` button; check firewall |
| `auth_failed` | Token expired or revoked | Create a new Long-Lived Access Token |
| Entity shows up read-only | HASS has no writable service for it | Expected behaviour; check the `disabled_by`/`hidden_by` flags in HASS |
| Writes silently ignored | ack flag is `true` | Write with `ack=false` from scripts |
| `service_timeout` | HASS slow to ack | Raise `responseTimeoutMs` in the Objects tab |

## FAQ

**Q:** Does the adapter run a local Home Assistant?
**A:** No. It is a pure WebSocket client against an *external* HASS installation.

**Q:** Will upgrading from v2 delete my ioBroker objects?
**A:** The adapter runs a one-time `deleteStaleObjects` on first v3 startup. Any object not matching the new schema is removed. Your HASS configuration is untouched.

**Q:** Why is `entities.*` disabled by default?
**A:** Because most VIS/smart-home surfaces expect `devices.*` with type-detector channels. Enable `entities.*` only if you know you need the raw mirror.

## Glossary

| HASS term | ioBroker equivalent |
|-----------|---------------------|
| Area | enum.rooms.* |
| Device (registry) | device (object) |
| Entity | channel (under `entities.*`) or state (inside a device channel) |
| Domain (light, switch, …) | first path segment under `entities.*` |
| Device class (temperature, motion, …) | role qualifier |
| `call_service` | state write with `ack=false` |

## License

MIT — see [LICENSE](../../LICENSE).
