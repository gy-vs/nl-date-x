import { Chrono } from "./chrono";
import { ParsedResult, ParsingOption, ParsingReference } from "./types";

import * as de from "./locales/de";
import * as en from "./locales/en";
import * as es from "./locales/es";
import * as fr from "./locales/fr";
import * as it from "./locales/it";
import * as ja from "./locales/ja";
import * as nl from "./locales/nl";
import * as pt from "./locales/pt";
import * as ru from "./locales/ru";
import * as sv from "./locales/sv";
import * as uk from "./locales/uk";
import * as zh from "./locales/zh";

/**
 * Option for {@link createMultiLocale}.
 */
export interface MultiLocaleOption {
    /**
     * If true, parse with every locale's strict-mode configuration
     * (like each locale's `strict` chrono). (default = false)
     */
    strict?: boolean;
}

const localeChronos: { [name: string]: { casual: Chrono; strict: Chrono } } = {
    "en": { casual: en.casual, strict: en.strict },
    "en.GB": { casual: en.GB, strict: new Chrono(en.configuration.createConfiguration(true, true)) },
    "de": { casual: de.casual, strict: de.strict },
    "es": { casual: es.casual, strict: es.strict },
    "fr": { casual: fr.casual, strict: fr.strict },
    "it": { casual: it.casual, strict: it.strict },
    "ja": { casual: ja.casual, strict: ja.strict },
    "nl": { casual: nl.casual, strict: nl.strict },
    "pt": { casual: pt.casual, strict: pt.strict },
    "ru": { casual: ru.casual, strict: ru.strict },
    "sv": { casual: sv.casual, strict: sv.strict },
    "uk": { casual: uk.casual, strict: uk.strict },
    "zh": { casual: zh.casual, strict: zh.strict },
    "zh.hans": { casual: zh.hans.casual, strict: zh.hans.strict },
    "zh.hant": { casual: zh.hant.casual, strict: zh.hant.strict },
};

/**
 * A Chrono-like parser created by {@link createMultiLocale} that parses the input
 * with several locales and merges the results into a single, non-overlapping list.
 */
export class MultiLocaleChrono {
    private readonly chronos: Array<Chrono>;

    constructor(locales: string[], option: MultiLocaleOption = {}) {
        if (!locales || locales.length === 0) {
            throw new Error(
                `createMultiLocale() requires a non-empty array of locale names ` +
                    `(e.g. ["en", "de", "zh.hans"]), but got: ${JSON.stringify(locales)}`
            );
        }

        this.chronos = locales.map((name) => {
            const locale = localeChronos[name];
            if (!locale) {
                throw new Error(
                    `createMultiLocale() got an unknown locale name: "${name}". ` +
                        `Supported locales are: ${Object.keys(localeChronos).join(", ")}`
                );
            }
            return option.strict ? locale.strict : locale.casual;
        });
    }

    /**
     * Parse the `text` with every configured locale, then merge the results.
     * Overlapping results are resolved by keeping the one covering the longest text;
     * when two locales cover the exact same range, the locale listed first wins.
     * The final results are sorted by their position in the text.
     */
    parse(text: string, referenceDate?: ParsingReference | Date, option?: ParsingOption): ParsedResult[] {
        let results: Array<{ result: ParsedResult; localeOrder: number }> = [];
        this.chronos.forEach((chrono, localeOrder) => {
            const parsedResults = chrono.parse(text, referenceDate, option);
            results = results.concat(parsedResults.map((result) => ({ result, localeOrder })));
        });

        results.sort((a, b) => {
            return (
                a.result.index - b.result.index ||
                b.result.text.length - a.result.text.length ||
                a.localeOrder - b.localeOrder
            );
        });

        const mergedResults: ParsedResult[] = [];
        let kept: { result: ParsedResult; localeOrder: number } = null;
        for (const current of results) {
            if (kept === null || current.result.index >= kept.result.index + kept.result.text.length) {
                if (kept !== null) {
                    mergedResults.push(kept.result);
                }
                kept = current;
                continue;
            }

            // The two results overlap. Keep the one covering the longer text;
            // on a tie (e.g. the exact same range), the earlier-listed locale wins.
            if (
                current.result.text.length > kept.result.text.length ||
                (current.result.text.length === kept.result.text.length && current.localeOrder < kept.localeOrder)
            ) {
                kept = current;
            }
        }
        if (kept !== null) {
            mergedResults.push(kept.result);
        }

        return mergedResults;
    }

    /**
     * A shortcut for calling {@link parse} then transform the result into Javascript's Date object
     * @return Date object created from the first parse result
     */
    parseDate(text: string, referenceDate?: ParsingReference | Date, option?: ParsingOption): Date | null {
        const results = this.parse(text, referenceDate, option);
        return results.length > 0 ? results[0].start.date() : null;
    }
}

/**
 * Create a parser that recognizes date/time mentions written in any of the given locales
 * (e.g. `createMultiLocale(["en", "de", "zh.hans"])`). The locale names match the exported
 * locale objects (`en`, `de`, ..., `zh`, `zh.hans`, `zh.hant`, `en.GB`).
 *
 * The returned object works like {@link en.casual | chrono.casual}: it has `parse()` and
 * `parseDate()` accepting the same reference date and {@link ParsingOption}.
 *
 * Each locale parses the input independently, and the results are merged so that no two
 * results overlap: the result covering the longest text is kept, and ties are resolved
 * in favor of the locale listed first in `locales`.
 */
export function createMultiLocale(locales: string[], option?: MultiLocaleOption): MultiLocaleChrono {
    return new MultiLocaleChrono(locales, option);
}
