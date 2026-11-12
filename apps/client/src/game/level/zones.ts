import { parseZones, type ZoneDefinition } from '@the-world/shared';

const files = import.meta.glob('@content/zones/*.json', { eager: true, import: 'default' });

/** Every zone in `content/zones/`, validated once at startup. */
export const ZONES: readonly ZoneDefinition[] = parseZones(files);

export function zonesForLevel(level: string): ZoneDefinition[] {
  return ZONES.filter((z) => z.level === level);
}
