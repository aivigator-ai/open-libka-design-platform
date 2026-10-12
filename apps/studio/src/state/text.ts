/** Interface text in the language the author chose. */
import { t as translate, type Key } from '../i18n.ts';
import { lang } from './store.ts';

export const t = (key: Key, vars?: Record<string, string | number>): string => translate(lang.value, key, vars);
