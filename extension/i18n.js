// chrome.i18n picks _locales/<browser language> and falls back to English.
// Outside the extension (unit tests, static preview) the key itself is returned.
export const t = (key, ...substitutions) => globalThis.chrome?.i18n?.getMessage(key, substitutions) || key;

// Static markup names its message: data-i18n for text, data-i18n-<attribute> for attributes.
export function localize(root = document) {
  for (const element of root.querySelectorAll('[data-i18n]')) element.textContent = t(element.dataset.i18n);
  for (const attribute of ['title', 'placeholder', 'aria-label'])
    for (const element of root.querySelectorAll(`[data-i18n-${attribute}]`)) element.setAttribute(attribute, t(element.getAttribute(`data-i18n-${attribute}`)));
}
