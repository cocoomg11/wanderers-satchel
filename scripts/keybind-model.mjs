/**
 * One-time key binding repair (0.7.1), pure. 0.6 registered the `open` action without a default, so Foundry stored an empty
 * list for it in the client setting `core.keybindings`; Foundry reads a stored empty list as "the user cleared the key", so the
 * default Shift+G added in 0.7.0 never applied in browsers that ran 0.6.
 */

/**
 * Whether to reset the action to its default: only a stored EMPTY list, once per browser. A stored non-empty list (the user's own
 * key), nothing stored (the default already applies) or a set flag never resets.
 * @param {unknown} stored the value stored for the action in `core.keybindings` (undefined when absent)
 * @param {boolean} migrated the per-browser flag
 * @returns {boolean}
 */
export function shouldResetKeybinding(stored, migrated) {
  if (migrated === true) return false;
  return Array.isArray(stored) && stored.length === 0;
}

/**
 * The stored value for one action out of the `core.keybindings` setting value (any shape; never throws).
 * @param {unknown} all
 * @param {string} key "<namespace>.<action>"
 * @returns {unknown}
 */
export function storedBinding(all, key) {
  if (!all || typeof all !== "object" || Array.isArray(all)) return undefined;
  return Object.hasOwn(all, key) ? /** @type {any} */ (all)[key] : undefined;
}
