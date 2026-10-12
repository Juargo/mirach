// Token parsing shared by the native generators (iOS and Android). Pure, no dependencies.

/** "sin-categoria" -> "sinCategoria" (lowerCamelCase identifier). */
export function camel(name) {
  return name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

/** "bucket" -> "Bucket" (UpperCamelCase identifier). */
export function pascal(name) {
  const c = camel(name);
  return c[0].toUpperCase() + c.slice(1);
}

/** Flattens color.{light,dark}.<group>.<token> into ordered entries, checking both themes match. */
export function collectColors(tokens) {
  const { light, dark } = tokens.color;
  const entries = [];
  for (const [group, items] of Object.entries(light)) {
    if (group.startsWith('$')) continue;
    for (const [name, leaf] of Object.entries(items)) {
      const darkLeaf = dark[group]?.[name];
      if (!darkLeaf) throw new Error(`Missing dark value for ${group}.${name}`);
      entries.push({ group, name, light: leaf.$value, dark: darkLeaf.$value });
    }
    for (const name of Object.keys(dark[group] ?? {})) {
      if (!items[name]) throw new Error(`Missing light value for ${group}.${name}`);
    }
  }
  return entries;
}

/** Copy leaves of one section as [key, text] pairs, skipping `$` metadata. */
export function copyEntries(tokens, section) {
  return Object.entries(tokens.copy[section])
    .filter(([k]) => !k.startsWith('$'))
    .map(([k, leaf]) => [k, leaf.$value]);
}
