/** A museum exhibit: one divine artifact and the island it came from. */
export interface Exhibit {
  id: string;
  name: string;
  mythology: string;
  /** Procedural model key the client knows how to build (e.g. "trident"). */
  model: string;
  /** Plaque text, written in the Archive's voice. */
  plaque: string;
  /** The island this artifact was recovered from (or will be, once islands exist). */
  island: string;
  /** Display order in the museum hall. */
  order: number;
}

/** Validates an exhibit file from `content/exhibits/`. Throws a readable error on bad data. */
export function parseExhibit(value: unknown, source = 'exhibit'): Exhibit {
  if (typeof value !== 'object' || value === null) throw new Error(`${source} must be an object`);
  const v = value as Record<string, unknown>;
  const text = (key: string, max: number): string => {
    const field = v[key];
    if (typeof field !== 'string' || field.trim() === '' || field.length > max) {
      throw new Error(`${source}: "${key}" must be text of 1-${max} characters`);
    }
    return field;
  };
  const id = text('id', 40);
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`${source}: id must be lowercase-dashed`);
  const order = v.order;
  if (typeof order !== 'number' || !Number.isInteger(order) || order < 0) {
    throw new Error(`${source}: "order" must be a whole number`);
  }
  return {
    id,
    name: text('name', 60),
    mythology: text('mythology', 40),
    model: text('model', 40),
    plaque: text('plaque', 600),
    island: text('island', 60),
    order,
  };
}

/** Parses many exhibits, rejects duplicate ids, and sorts them for display. */
export function parseExhibits(files: Record<string, unknown>): Exhibit[] {
  const exhibits = Object.entries(files).map(([path, json]) => parseExhibit(json, path));
  const ids = new Set<string>();
  for (const e of exhibits) {
    if (ids.has(e.id)) throw new Error(`Duplicate exhibit id "${e.id}"`);
    ids.add(e.id);
  }
  return exhibits.sort((a, b) => a.order - b.order);
}
