import { ar } from './ar.js';
import { en } from './en.js';

export type Locale = 'en' | 'ar';

const dictionaries: Record<Locale, unknown> = { en, ar };

function resolvePath(dictionary: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, segment) => {
    if (node !== null && typeof node === 'object' && segment in node) {
      return (node as Record<string, unknown>)[segment];
    }
    return undefined;
  }, dictionary);
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export function t(key: string, locale: Locale, params?: Record<string, string | number>): string {
  const value = resolvePath(dictionaries[locale], key) ?? resolvePath(dictionaries.en, key);

  if (typeof value !== 'string') {
    return key;
  }

  return interpolate(value, params);
}

export function isSupportedLocale(value: string): value is Locale {
  return value === 'en' || value === 'ar';
}

export const DEFAULT_LOCALE: Locale = 'en';
