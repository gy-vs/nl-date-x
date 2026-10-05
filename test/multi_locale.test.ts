import * as chrono from "../src";
import { Chrono, ParsedResult } from "../src";
import { Configuration } from "../src/chrono";
import ENWeekdayParser from "../src/locales/en/parsers/ENWeekdayParser";

const TICKET_TEXT = "Call on Friday at 3pm, danach am Montag um 9 Uhr, 后天下午3点 再确认。";
const REFERENCE_DATE = new Date("2024-03-06T08:00:00Z");

function resultShape(result: ParsedResult) {
    return {
        index: result.index,
        text: result.text,
        start: result.start.date().toISOString(),
        end: result.end?.date().toISOString() ?? null,
        localeTag: Array.from(result.tags()).find((tag) => tag.startsWith("locale/")),
    };
}

describe("createMultiLocale", () => {
    test("parses mixed-language text with multiple locales at once", () => {
        const results = chrono.createMultiLocale(["en", "de", "zh"]).parse(TICKET_TEXT, REFERENCE_DATE);

        expect(results).toHaveLength(3);
        // Ordered by occurrence in the original text
        expect(results.map((r) => r.index)).toEqual([5, 30, 50]);

        expect(resultShape(results[0])).toEqual({
            index: 5,
            text: "on Friday at 3pm",
            start: "2024-03-08T15:00:00.000Z",
            end: null,
            localeTag: "locale/en",
        });
        expect(resultShape(results[1])).toEqual({
            index: 30,
            text: "am Montag um 9 Uhr",
            start: "2024-03-04T09:00:00.000Z",
            end: null,
            localeTag: "locale/de",
        });
        expect(resultShape(results[2])).toEqual({
            index: 50,
            text: "后天下午3点 ",
            start: "2024-03-08T15:00:00.000Z",
            end: null,
            localeTag: "locale/zh",
        });
    });

    test("zh.hans and zh.hant are accepted and tagged precisely", () => {
        const results = chrono.createMultiLocale(["en", "de", "zh.hans"]).parse(TICKET_TEXT, REFERENCE_DATE);
        expect(results).toHaveLength(3);
        expect(results[2].text).toBe("后天下午3点 ");
        expect(results[2].tags()).toContain("locale/zh.hans");
    });

    test("removes overlapping results and keeps the one covering the most text", () => {
        // The English parser recognizes "on Friday at 3pm"; the German parser
        // also recognizes the contained "3pm". Only the longer English result
        // must remain.
        const results = chrono.createMultiLocale(["en", "de"]).parse(TICKET_TEXT, REFERENCE_DATE);
        const texts = results.map((r) => r.text);
        expect(texts).toContain("on Friday at 3pm");
        expect(texts).not.toContain("3pm");

        for (let i = 1; i < results.length; i++) {
            const previous = results[i - 1];
            const current = results[i];
            expect(current.index).toBeGreaterThanOrEqual(previous.index + previous.text.length);
        }
    });

    test("on identical spans, the locale listed earlier wins", () => {
        const text = "3pm";
        const deFirst = chrono.createMultiLocale(["de", "en"]).parse(text, REFERENCE_DATE);
        expect(deFirst).toHaveLength(1);
        expect(deFirst[0].tags()).toContain("locale/de");

        const enFirst = chrono.createMultiLocale(["en", "de"]).parse(text, REFERENCE_DATE);
        expect(enFirst).toHaveLength(1);
        expect(enFirst[0].tags()).toContain("locale/en");
    });

    test("single locale produces exactly the same results as that locale's entry point", () => {
        const directByLocale: Record<string, chrono.Chrono> = {
            en: chrono.en.casual,
            de: chrono.de.casual,
            zh: chrono.zh.casual,
            "zh.hans": chrono.zh.hans.casual,
            "zh.hant": chrono.zh.hant.casual,
            ja: chrono.ja.casual,
        };
        for (const locale of Object.keys(directByLocale) as chrono.LocaleName[]) {
            const multi = chrono.createMultiLocale([locale]);
            expect(multi.parse(TICKET_TEXT, REFERENCE_DATE).map(resultShape)).toEqual(
                directByLocale[locale].parse(TICKET_TEXT, REFERENCE_DATE).map(resultShape)
            );
        }
    });

    test("single locale in strict mode matches the strict entry point", () => {
        const text = "let's meet tomorrow";
        // "tomorrow" is casual-only
        expect(chrono.createMultiLocale(["en"], { strict: true }).parse(text, REFERENCE_DATE)).toHaveLength(0);

        const strictText = "2024-03-10T15:00:00Z";
        const strictResults = chrono
            .createMultiLocale(["en"], { strict: true })
            .parse(strictText, REFERENCE_DATE)
            .map(resultShape);
        expect(strictResults).toEqual(chrono.en.strict.parse(strictText, REFERENCE_DATE).map(resultShape));
    });

    test("parseDate returns the first result date", () => {
        const multi = chrono.createMultiLocale(["en", "de", "zh"]);
        expect(multi.parseDate(TICKET_TEXT, REFERENCE_DATE)?.toISOString()).toBe("2024-03-08T15:00:00.000Z");
        expect(multi.parseDate("nonsense without date", REFERENCE_DATE)).toBeNull();
    });

    test("forwards reference and parsing options (forwardDate, timezone)", () => {
        const ref = new Date("2024-03-06T20:00:00Z"); // Wednesday evening
        // "Friday" after the reference when forwardDate is set
        const forwardResults = chrono.createMultiLocale(["en"]).parse("Friday", ref, { forwardDate: true });
        expect(forwardResults[0].start.date().toISOString()).toBe("2024-03-08T12:00:00.000Z");

        const withTimezone = chrono
            .createMultiLocale(["en"])
            .parse("Friday at 3pm", { instant: ref, timezone: "JST" }, { timezones: { JST: 60 * 9 } });
        expect(withTimezone[0].start.date().toISOString()).toBe("2024-03-08T06:00:00.000Z");
    });

    test("throws on an empty locale list", () => {
        expect(() => chrono.createMultiLocale([])).toThrow();
    });

    test("throws and names the unknown locale", () => {
        expect(() => chrono.createMultiLocale(["en", "xx"] as chrono.LocaleName[])).toThrow(/xx/);
        // Built-in object properties must not be treated as locale names
        expect(() => chrono.createMultiLocale(["toString"] as unknown as chrono.LocaleName[])).toThrow(/toString/);
    });
});

describe("locale tags on existing entry points", () => {
    const tagEntries: Array<[string, () => chrono.Chrono]> = [
        ["en", () => chrono.en.casual],
        ["en strict", () => chrono.en.strict],
        ["en.GB", () => chrono.en.GB],
        ["de", () => chrono.de.casual],
        ["de strict", () => chrono.de.strict],
        ["es", () => chrono.es.casual],
        ["es strict", () => chrono.es.strict],
        ["fr", () => chrono.fr.casual],
        ["fr strict", () => chrono.fr.strict],
        ["it", () => chrono.it.casual],
        ["it strict", () => chrono.it.strict],
        ["it.GB", () => chrono.it.GB],
        ["ja", () => chrono.ja.casual],
        ["ja strict", () => chrono.ja.strict],
        ["nl", () => chrono.nl.casual],
        ["nl strict", () => chrono.nl.strict],
        ["pt", () => chrono.pt.casual],
        ["pt strict", () => chrono.pt.strict],
        ["ru", () => chrono.ru.casual],
        ["ru strict", () => chrono.ru.strict],
        ["sv", () => chrono.sv.casual],
        ["sv strict", () => chrono.sv.strict],
        ["uk", () => chrono.uk.casual],
        ["uk strict", () => chrono.uk.strict],
        ["zh", () => chrono.zh.casual],
        ["zh strict", () => chrono.zh.strict],
        ["zh.hans", () => chrono.zh.hans.casual],
        ["zh.hans strict", () => chrono.zh.hans.strict],
        ["zh.hant", () => chrono.zh.hant.casual],
        ["zh.hant strict", () => chrono.zh.hant.strict],
    ];

    test.each(tagEntries)("%s tags its results with the locale name", (_name, getChrono) => {
        // ISOFormatParser is part of every locale configuration (incl. strict)
        const text = "2024-03-10T15:00:00Z";
        const results = getChrono().parse(text, REFERENCE_DATE);
        expect(results.length).toBeGreaterThan(0);
        for (const result of results) {
            const localeTags = Array.from(result.tags()).filter((tag) => tag.startsWith("locale/"));
            expect(localeTags).toHaveLength(1);
            expect(result.start.tags()).toContain(localeTags[0]);
        }
    });

    test("top-level shortcuts parse as English and carry locale/en", () => {
        for (const result of chrono.parse("on Friday at 3pm", REFERENCE_DATE)) {
            expect(result.tags()).toContain("locale/en");
            expect(result.start.tags()).toContain("locale/en");
        }
    });

    test("locale tag on result carries over to start and end of a range", () => {
        const results = chrono.en.casual.parse("Friday 3pm - Saturday 4pm", REFERENCE_DATE);
        expect(results).toHaveLength(1);
        expect(results[0].tags()).toContain("locale/en");
        expect(results[0].start.tags()).toContain("locale/en");
        expect(results[0].end?.tags()).toContain("locale/en");
    });

    test("user-built configuration from createCasualConfiguration carries the locale tag", () => {
        const configuration: Configuration = chrono.de.createCasualConfiguration();
        const result = new Chrono(configuration).parse("am Montag um 9 Uhr", REFERENCE_DATE);
        expect(result.length).toBeGreaterThan(0);
        expect(result[0].tags()).toContain("locale/de");
        expect(result[0].start.tags()).toContain("locale/de");
    });

    test("fully custom configuration without locale is not force-tagged", () => {
        const configuration: Configuration = {
            parsers: [new ENWeekdayParser()],
            refiners: [],
        };
        const result = new Chrono(configuration).parse("Friday", REFERENCE_DATE);
        expect(result).toHaveLength(1);
        expect(Array.from(result[0].tags()).filter((tag) => tag.startsWith("locale/"))).toHaveLength(0);

        // Passing an explicit locale to the constructor tags the results.
        const tagged = new Chrono(configuration, "custom").parse("Friday", REFERENCE_DATE);
        expect(tagged[0].tags()).toContain("locale/custom");
    });
});
