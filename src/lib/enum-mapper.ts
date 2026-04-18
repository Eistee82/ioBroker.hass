/**
 * Matches HASS areas and device-classes to existing ioBroker enum members
 * (enum.rooms.* / enum.functions.*). Never creates enums — only returns
 * match suggestions to the Admin UI and to the AssignmentStore.
 */

export interface EnumMember {
    /** Full ioBroker object id, e.g. "enum.rooms.wohnzimmer". */
    id: string;
    /** Common.name — may be a plain string or multi-lang block. */
    name: string | Record<string, string>;
}

export interface EnumSuggestion {
    enumId: string | null;
    /** true if match was based on a case-insensitive name equality. */
    exact: boolean;
}

const FUNCTION_CANDIDATES: Record<string, string[]> = {
    light: ['Licht', 'Light', 'Lighting', 'Beleuchtung'],
    switch: ['Geräte', 'Appliances', 'Devices'],
    climate: ['Heizung', 'Heating', 'Temperature'],
    cover: ['Rollladen', 'Jalousien', 'Shutters', 'Blinds'],
    lock: ['Sicherheit', 'Security'],
    media_player: ['Medien', 'Media', 'Entertainment'],
    sensor: ['Sensoren', 'Sensors'],
    binary_sensor: ['Sensoren', 'Sensors', 'Security'],
    vacuum: ['Reinigung', 'Cleaning'],
    fan: ['Lüftung', 'Ventilation', 'Fan'],
};

export class EnumMapper {
    constructor(
        private readonly rooms: EnumMember[],
        private readonly functions: EnumMember[],
    ) {}

    suggestRoom(areaName: string | null | undefined): EnumSuggestion {
        if (!areaName) {
            return { enumId: null, exact: false };
        }
        return matchByName(this.rooms, areaName);
    }

    /**
     * Suggest an ioBroker function enum for a HASS domain.
     * The mapping mirrors common German/English naming in practice.
     */
    suggestFunction(domain: string): EnumSuggestion {
        const candidates = FUNCTION_CANDIDATES[domain] ?? [];
        for (const candidate of candidates) {
            const hit = matchByName(this.functions, candidate);
            if (hit.enumId) {
                return hit;
            }
        }
        return { enumId: null, exact: false };
    }
}

function matchByName(members: EnumMember[], target: string): EnumSuggestion {
    const normalisedTarget = target.trim().toLowerCase();
    for (const m of members) {
        const names = asNames(m.name);
        for (const n of names) {
            if (n.trim().toLowerCase() === normalisedTarget) {
                return { enumId: m.id, exact: true };
            }
        }
    }
    return { enumId: null, exact: false };
}

function asNames(name: string | Record<string, string>): string[] {
    if (typeof name === 'string') {
        return [name];
    }
    return Object.values(name);
}
