![Logo](../../admin/hass.png)

# ioBroker.hass v3 — Dokumentation

ioBroker.hass v3 verbindet ioBroker mit einer externen Home-Assistant-Installation über die native WebSocket-API. HASS-Entities werden in den ioBroker-Objektbaum gespiegelt, ioBroker-State-Schreibvorgänge werden als HASS-Service-Calls an HASS zurückgereicht, und die ioBroker-Geräte-/Channel-/State-/Rollen-Konvention wird konsequent eingehalten — so dass VIS, Material, Alexa, iQontrol und Yahka die Geräte direkt erkennen.

## Inhaltsverzeichnis

- [Erste Schritte](#erste-schritte)
- [Objektbäume](#objektbäume)
- [Konfigurations-Tabs](#konfigurations-tabs)
- [States-Referenz](./states-reference.md)
- [Rezepte](#rezepte)
- [Performance-Tuning](#performance-tuning)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [Glossar](#glossar)

## Voraussetzungen

- ioBroker js-controller ≥ 6.0.11
- Node.js ≥ 20 (LTS empfohlen)
- Home Assistant Core ≥ **2024.4** (für komprimierte `subscribe_entities`-Deltas + Registry-Update-Events)
- Long-Lived Access Token eines HASS-Admin-Users

## Erste Schritte

### 1. Adapter installieren

Aus dem ioBroker-Repository oder direkt von GitHub. Lege eine neue Instanz `hass.0` an.

### 2. Long-Lived Access Token erzeugen

1. In Home Assistant: Avatar unten links → **Profil → Sicherheit → Langlebige Zugriffstoken**
2. **Token erstellen**, Namen vergeben (z.B. `ioBroker`), Token kopieren.

Gültig für 10 Jahre. Der Adapter speichert ihn verschlüsselt.

### 3. Adapter konfigurieren

Öffne die `hass.0`-Einstellungen im ioBroker-Admin.

- **Verbindung**
  - Host, Port (8123), HTTPS/WSS nur bei TLS
  - Access Token einfügen
  - *(Expert)* Selbstsignierte Zertifikate — nur im vertrauenswürdigen LAN
- **Verbindung testen** — liefert die HASS-Core-Version zurück.

### 4. Objektbäume wählen

Tab **Objekte**:
- `devices.*`-Baum: Standard. Type-Detector-konform, Voraussetzung für Alexa/VIS/Material.
- `entities.*`-Baum: optionaler 1:1-Mirror aller HASS-Entities. Für Skripte, die HASS-Attribute direkt lesen wollen.

### 5. Scope eingrenzen

HASS liefert oft hunderte Entities (Router-Diagnose, Update-Sensoren…). Im Tab **Auswahl** abwählen, was du nicht brauchst.

### 6. Räume + Funktionen zuordnen

Tab **Zuordnung** — matche deine Geräte auf bestehende `enum.rooms.*` und `enum.functions.*`. Der Adapter legt **nie** neue Enums an.

## Objektbäume

### `devices.*` — Type-Detector-konform

```
hass.0.devices.<device_id>                     type=device
               ├── light / dimmer / rgb        type=channel (erkannter Typ)
               │    ├── ON_SET                 role=switch.light
               │    ├── ON_ACTUAL              role=sensor.light
               │    ├── DIMMER / RGB
               │    └── ACTUAL / SET
               └── <weiterer channel pro entity>
```

Vollständiges Schema pro Typ: [States-Referenz](./states-reference.md).

### `entities.*` — 1:1-HASS-Mirror (opt-in)

```
hass.0.entities.<domain>.<entity_id>   type=channel
                          ├── state
                          ├── <attr_1>
                          └── <attr_n>
```

`.state` ist der Haupt-Write-Punkt; Attribute landen daneben mit Rollen aus dem `role-mapper`.

## Konfigurations-Tabs

| Tab | Zweck |
|-----|-------|
| Verbindung | Host, Port, Token, TLS, selbstsignierte Zertifikate (Expert) |
| Objekte | Baum-Toggles, Debounce/Coalesce/Timeouts (Expert) |
| Auswahl | Device-/Entity-Filter; Glob-Muster im Expertenmodus |
| Zuordnung | HASS-Area ↔ ioBroker-Raum/Funktion |
| Mapping | Override der automatischen Type-Detector-Erkennung |
| Diagnose | Status, Statistiken, manueller Service-Call, Sync-Button |

## Rezepte

### Alexa-Integration
1. `devices.*`-Baum aktivieren.
2. Raum + Funktion im Tab **Zuordnung** setzen.
3. Im `iot`-Adapter die Geräte für Alexa freischalten.

### RGB-Lampe vom Klick bis HASS
Ein Write `#ff8800` auf `devices.<id>.rgb.RGB` wird zu `[r, g, b]` dekodiert, der Adapter sendet `light.turn_on` mit `rgb_color`.

### Energie-Monitoring mit hoher Update-Frequenz
Tab **Objekte** → Debounce-Override: Pattern `sensor.energy_*`, Intervall `500` ms.

## Performance-Tuning

| Szenario | Empfohlene Defaults |
|----------|---------------------|
| Normale Hausautomation | Debounce 50 ms, Coalesce 30 ms |
| Dimmer-Slider in VIS | Coalesce 30–50 ms |
| Energiesensoren (≥10 Hz) | Debounce 500 ms als Pattern-Override |

p95-Roundtrip sollte im LAN unter **100 ms** bleiben.

## Troubleshooting

| Symptom | Ursache | Fix |
|---------|---------|-----|
| `connection_lost`-Loop | Falscher Host/Port, HASS nicht erreichbar | „Verbindung testen"; Firewall prüfen |
| `auth_failed` | Token abgelaufen oder widerrufen | Neuen Long-Lived Access Token anlegen |
| Entity nur read-only | HASS hat keinen passenden schreibenden Service | Erwartetes Verhalten; `disabled_by`/`hidden_by` in HASS prüfen |
| Writes werden ignoriert | ack-Flag ist `true` | Aus Skripten mit `ack=false` schreiben |
| `service_timeout` | HASS antwortet langsam | `responseTimeoutMs` im Tab Objekte erhöhen |

## FAQ

**F:** Läuft ein eigenes Home Assistant im Adapter?
**A:** Nein. Der Adapter ist ein reiner WebSocket-Client gegen ein *externes* HASS.

**F:** Zerstört der Umstieg v2 → v3 meine ioBroker-Objekte?
**A:** Beim ersten v3-Start läuft ein einmaliger `deleteStaleObjects`. Alles, was nicht zum neuen Schema passt, wird entfernt. HASS selbst bleibt unverändert.

**F:** Warum ist `entities.*` standardmäßig aus?
**A:** Weil die meisten VIS-/Smart-Home-Surfaces `devices.*` mit Type-Detector-Channels erwarten. `entities.*` ist für Power-User mit Skript-Anwendungen.

## Glossar

| HASS-Begriff | ioBroker-Äquivalent |
|-----------|---------------------|
| Area | enum.rooms.* |
| Device (Registry) | device (Objekt) |
| Entity | channel (unter `entities.*`) oder state (in einem Device-Channel) |
| Domain (light, switch, …) | erstes Pfadsegment unter `entities.*` |
| Device class (temperature, motion, …) | Rollen-Qualifier |
| `call_service` | State-Write mit `ack=false` |

## Lizenz

MIT — siehe [LICENSE](../../LICENSE).
