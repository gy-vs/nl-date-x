import { Chrono } from "./chrono";
import { ParsedResult, ParsingOption, ParsingReference } from "./types";

import * as en from "./locales/en";
import * as de from "./locales/de";
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
 * The locale names accepted by {@link createMultiLocale}. The names are the
 * same ones used by the exported language objects (e.g. `chrono.de`,
 * `chrono.zh.hant`).
 */
export type LocaleName =
    | "en"
    | "en.GB"
    | "de"
    | "es"
    | "fr"
    | "it"
    | "ja"
    | "nl"
    | "pt"
    | "ru"
    | "sv"
    | "uk"
    | "zh"
    | "zh.hans"
    | "zh.hant";

/**
 * Options for {@link createMultiLocale}.
 */
export interface MultiLocaleOption {
    /**
     * When `true`, each locale is parsed with its strict configuration
     * (equivalent to using `<locale>.strict` instead of `<locale>.casual`).
     */
    strict?: boolean;
}

/**
 * A Chrono-like object returned by {@link createMultiLocale}.
 * It exposes the same `parse()` and `parseDate()` entry points as
 * {@link Chrono}.
 */
export interface MultiLocaleChrono {
    parse(text: string, referenceDate?: ParsingReference | Date, option?: ParsingOption): ParsedResult[];
    parseDate(text: string, referenceDate?: ParsingReference | Date, option?: ParsingOption): Date | null;
}

type ChronoFactory = (strictMode: boolean) => Chrono;

/**
 * Factories for all supported locale names. Earlier entries in the locales
 * array take precedence when two locales recognize the exact same span of
 * text.
 */
const localeFactories: { [locale in LocaleName]: ChronoFactory } = {
    en: (strictMode) => (strictMode ? en.strict : en.casual),
    "en.GB": (strictMode) =>
        strictMode ? new Chrono(en.configuration.createConfiguration(true, true), "en.GB") : en.GB,
    de: (strictMode) => (strictMode ? de.strict : de.casual),
    es: (strictMode) => (strictMode ? es.strict : es.casual),
    fr: (strictMode) => (strictMode ? fr.strict : fr.casual),
    it: (strictMode) => (strictMode ? it.strict : it.casual),
    ja: (strictMode) => (strictMode ? ja.strict : ja.casual),
    nl: (strictMode) => (strictMode ? nl.strict : nl.casual),
    pt: (strictMode) => (strictMode ? pt.strict : pt.casual),
    ru: (strictMode) => (strictMode ? ru.strict : ru.casual),
    sv: (strictMode) => (strictMode ? sv.strict : sv.casual),
    uk: (strictMode) => (strictMode ? uk.strict : uk.casual),
    zh: (strictMode) => (strictMode ? zh.strict : zh.casual),
    "zh.hans": (strictMode) => (strictMode ? zh.hans.strict : zh.hans.casual),
    "zh.hant": (strictMode) => (strictMode ? zh.hant.strict : zh.hant.casual),
};

class MultiLocaleChronoImpl implements MultiLocaleChrono {
    private readonly chronos: Array<{ chrono: Chrono; priority: number }>;

    constructor(locales: LocaleName[], strictMode: boolean) {
        if (locales.length === 0) {
            throw new Error("chrono.createMultiLocale requires at least one locale, but an empty array was given");
        }

        this.chronos = locales.map((locale, priority) => {
            const factory = Object.prototype.hasOwnProperty.call(localeFactories, locale)
                ? localeFactories[locale]
                : null;
            if (!factory) {
                throw new Error(`chrono.createMultiLocale: unknown locale name '${locale}'`);
            }
            return { chrono: factory(strictMode), priority };
        });
    }

    parse(text: string, referenceDate?: ParsingReference | Date, option?: ParsingOption): ParsedResult[] {
        const candidates: Array<{ result: ParsedResult; priority: number }> = [];
        for (const { chrono, priority } of this.chronos) {
            for (const result of chrono.parse(text, referenceDate, option)) {
                candidates.push({ result, priority });
            }
        }

        // Sort by position in the text. Results starting at the same position
        // are ordered by locale priority (earlier locale in the input first).
        candidates.sort((a, b) => a.result.index - b.result.index || a.priority - b.priority);

        // Remove overlapping results. The result covering the most text wins;
        // on an exact tie, the locale listed earlier wins.
        const filteredResults: ParsedResult[] = [];
        let best: { result: ParsedResult; priority: number } = null;
        for (const candidate of candidates) {
            if (!best || candidate.result.index >= best.result.index + best.result.text.length) {
                if (best) {
                    filteredResults.push(best.result);
                }
                best = candidate;
                continue;
            }

            if (
                candidate.result.text.length > best.result.text.length ||
                (candidate.result.text.length === best.result.text.length && candidate.priority < best.priority)
            ) {
                best = candidate;
            }
        }
        if (best) {
            filteredResults.push(best.result);
        }

        return filteredResults;
    }

    parseDate(text: string, referenceDate?: ParsingReference | Date, option?: ParsingOption): Date | null {
        const results = this.parse(text, referenceDate, option);
        return results.length > 0 ? results[0].start.date() : null;
    }
}

/**
 * Create a Chrono object that parses the input using multiple locales at once.
 *
 * The input is parsed independently by each listed locale, and the results
 * are merged: results are ordered by their position in the text, and
 * overlapping results are de-duplicated, keeping the one covering the most
 * text. If two locales recognize the exact same span, the locale listed
 * earlier in `locales` takes precedence.
 *
 * Every returned result carries a `locale/<name>` tag (also on `start` and
 * `end`) identifying the locale that produced it.
 *
 * @param locales Locale names, e.g. `["en", "de", "zh.hans"]`. `zh` is an
 *                alias for the combined simplified/traditional configuration.
 * @param option  Parsing options (currently only `strict`).
 */
export function createMultiLocale(locales: LocaleName[], option?: MultiLocaleOption): MultiLocaleChrono {
    return new MultiLocaleChronoImpl(locales, option?.strict ?? false);
}
