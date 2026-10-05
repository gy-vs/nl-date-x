import * as chrono from "../src";
import { createMultiLocale, MultiLocaleChrono, MultiLocaleOption, ParsedResult } from "../src";
import "./test_util";

// Wednesday, 2024-03-06 08:00 UTC
const REF_DATE = new Date("2024-03-06T08:00:00Z");

function expectSameResults(actual: ParsedResult[], expected: ParsedResult[]) {
    expect(actual.length).toBe(expected.length);
    for (let i = 0; i < actual.length; i++) {
        expect(actual[i].index).toBe(expected[i].index);
        expect(actual[i].text).toBe(expected[i].text);
        expect(actual[i].date().getTime()).toBe(expected[i].date().getTime());
        expect(Array.from(actual[i].tags()).sort()).toEqual(Array.from(expected[i].tags()).sort());
    }
}

function expectNoOverlap(results: ParsedResult[]) {
    const sorted = [...results].sort((a, b) => a.index - b.index);
    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const current = sorted[i];
        expect(current.index).toBeGreaterThanOrEqual(prev.index + prev.text.length);
    }
}

test("Test - createMultiLocale parses a mixed-language text in a single call", () => {
    const text = "Call on Friday at 3pm, danach am Montag um 9 Uhr, 后天下午3点 再确认。";
    const multi = createMultiLocale(["en", "de", "zh"]);
    const results = multi.parse(text, REF_DATE);

    expect(results).toHaveLength(3);
    expectNoOverlap(results);

    // Results are ordered by their position in the text
    expect(results[0].index).toBe(5);
    expect(results[0].text).toBe("on Friday at 3pm");
    expect(results[0].start).toBeDate(new Date("2024-03-08T15:00:00Z"));
    expect(results[0].tags()).toContain("locale/en");

    expect(results[1].index).toBe(30);
    expect(results[1].text).toBe("am Montag um 9 Uhr");
    expect(results[1].start).toBeDate(new Date("2024-03-04T09:00:00Z"));
    expect(results[1].tags()).toContain("locale/de");

    expect(results[2].index).toBe(50);
    expect(results[2].text).toContain("后天下午3点");
    expect(results[2].start).toBeDate(new Date("2024-03-08T15:00:00Z"));
    expect(results[2].tags()).toContain("locale/zh");
});

test("Test - createMultiLocale parseDate() works like chrono.casual.parseDate()", () => {
    const text = "Call on Friday at 3pm, danach am Montag um 9 Uhr, 后天下午3点 再确认。";
    const multi = createMultiLocale(["en", "de", "zh"]);

    expect(multi.parseDate(text, REF_DATE)).toStrictEqual(new Date("2024-03-08T15:00:00Z"));
    expect(multi.parseDate("nothing to parse here", REF_DATE)).toBeNull();
});

test("Test - createMultiLocale keeps the result covering the longest text on overlap", () => {
    const text = "Call on Friday at 3pm, danach am Montag um 9 Uhr, 后天下午3点 再确认。";

    // German alone extracts "3pm" out of the English part. Even with German listed
    // first, the longer English mention ("on Friday at 3pm") must win.
    const results = createMultiLocale(["de", "en", "zh"]).parse(text, REF_DATE);

    expect(results).toHaveLength(3);
    expect(results[0].text).toBe("on Friday at 3pm");
    expect(results[0].tags()).toContain("locale/en");
    expect(results.some((r) => r.text === "3pm")).toBe(false);
});

test("Test - createMultiLocale resolves identical ranges by locale order", () => {
    // Both English and German recognize the ISO format "2024-03-08" at the same range.
    const deFirst = createMultiLocale(["de", "en"]).parse("2024-03-08", REF_DATE);
    expect(deFirst).toHaveLength(1);
    expect(deFirst[0].tags()).toContain("locale/de");

    const enFirst = createMultiLocale(["en", "de"]).parse("2024-03-08", REF_DATE);
    expect(enFirst).toHaveLength(1);
    expect(enFirst[0].tags()).toContain("locale/en");
});

test("Test - createMultiLocale with a single locale matches the locale's own parse()", () => {
    const text = "Call on Friday at 3pm, danach am Montag um 9 Uhr, 后天下午3点 再确认。";

    expectSameResults(createMultiLocale(["en"]).parse(text, REF_DATE), chrono.en.parse(text, REF_DATE));
    expectSameResults(createMultiLocale(["de"]).parse(text, REF_DATE), chrono.de.parse(text, REF_DATE));
    expectSameResults(createMultiLocale(["zh"]).parse(text, REF_DATE), chrono.zh.parse(text, REF_DATE));
    expectSameResults(createMultiLocale(["zh.hans"]).parse(text, REF_DATE), chrono.zh.hans.parse(text, REF_DATE));
    expectSameResults(
        createMultiLocale(["ja"]).parse("2024年3月8日 15時", REF_DATE),
        chrono.ja.parse("2024年3月8日 15時", REF_DATE)
    );
});

test("Test - createMultiLocale supports zh, zh.hans and zh.hant locale names", () => {
    const hansResults = createMultiLocale(["zh.hans"]).parse("后天下午3点", REF_DATE);
    expect(hansResults).toHaveLength(1);
    expect(hansResults[0].start).toBeDate(new Date("2024-03-08T15:00:00Z"));
    expect(hansResults[0].tags()).toContain("locale/zh.hans");

    const hantResults = createMultiLocale(["zh.hant"]).parse("聽日", REF_DATE);
    expect(hantResults).toHaveLength(1);
    expect(hantResults[0].start).toBeDate(new Date("2024-03-07T12:00:00Z"));
    expect(hantResults[0].tags()).toContain("locale/zh.hant");

    // "zh" covers both scripts
    expect(createMultiLocale(["zh"]).parse("后天下午3点", REF_DATE)).toHaveLength(1);
    expect(createMultiLocale(["zh"]).parse("聽日", REF_DATE)).toHaveLength(1);
});

test("Test - createMultiLocale with strict option uses each locale's strict mode", () => {
    // "now" is a casual-only English expression
    expect(createMultiLocale(["en"]).parse("now", REF_DATE)).toHaveLength(1);
    expect(createMultiLocale(["en"], { strict: true }).parse("now", REF_DATE)).toHaveLength(0);

    // "明日" is a casual-only Japanese expression
    expect(createMultiLocale(["ja"]).parse("明日", REF_DATE)).toHaveLength(1);
    expect(createMultiLocale(["ja"], { strict: true }).parse("明日", REF_DATE)).toHaveLength(0);

    // The strict multi-locale parse matches the locales' own strict parses
    const text = "Call on Friday at 3pm, danach am Montag um 9 Uhr";
    expectSameResults(
        createMultiLocale(["en"], { strict: true }).parse(text, REF_DATE),
        chrono.strict.parse(text, REF_DATE)
    );
    expectSameResults(
        createMultiLocale(["de"], { strict: true }).parse(text, REF_DATE),
        chrono.de.strict.parse(text, REF_DATE)
    );
});

test("Test - createMultiLocale passes reference and options through to the locales", () => {
    const multi = createMultiLocale(["en"]);

    // forwardDate option
    const refDate = new Date("2024-03-06T16:00:00Z");
    expectSameResults(
        multi.parse("3pm", refDate, { forwardDate: true }),
        chrono.parse("3pm", refDate, { forwardDate: true })
    );
    expect(multi.parse("3pm", refDate, { forwardDate: true })[0].start).toBeDate(new Date("2024-03-07T15:00:00Z"));

    // reference with timezone
    const reference = { instant: new Date("2024-03-06T08:00:00Z"), timezone: "JST" };
    expectSameResults(multi.parse("3pm", reference), chrono.parse("3pm", reference));

    // timezones option
    const option = { timezones: { CXT: 420 } };
    expectSameResults(multi.parse("3pm CXT", REF_DATE, option), chrono.parse("3pm CXT", REF_DATE, option));
});

test("Test - createMultiLocale throws on empty or unknown locales", () => {
    expect(() => createMultiLocale([])).toThrow();

    expect(() => createMultiLocale(["xx"])).toThrow(/xx/);
    expect(() => createMultiLocale(["en", "klingon"])).toThrow(/klingon/);
});

test("Test - createMultiLocale accepts the exported option type", () => {
    const option: MultiLocaleOption = { strict: false };
    const multi: MultiLocaleChrono = createMultiLocale(["en", "de"], option);
    expect(multi.parse("on Friday at 3pm", REF_DATE)).toHaveLength(1);
});

test("Test - Existing entry points tag results with the locale name", () => {
    const text = "2024-03-08";

    const entries: Array<[string, { parse: (text: string, ref?: Date) => ParsedResult[] }]> = [
        ["en", chrono.casual],
        ["en", chrono.strict],
        ["en", chrono.en.casual],
        ["en", chrono.en.strict],
        ["en.GB", chrono.en.GB],
        ["de", chrono.de.casual],
        ["de", chrono.de.strict],
        ["es", chrono.es.casual],
        ["es", chrono.es.strict],
        ["fr", chrono.fr.casual],
        ["fr", chrono.fr.strict],
        ["it", chrono.it.casual],
        ["it", chrono.it.strict],
        ["ja", chrono.ja.casual],
        ["ja", chrono.ja.strict],
        ["nl", chrono.nl.casual],
        ["nl", chrono.nl.strict],
        ["pt", chrono.pt.casual],
        ["pt", chrono.pt.strict],
        ["ru", chrono.ru.casual],
        ["ru", chrono.ru.strict],
        ["sv", chrono.sv.casual],
        ["sv", chrono.sv.strict],
        ["uk", chrono.uk.casual],
        ["uk", chrono.uk.strict],
        ["zh", chrono.zh.casual],
        ["zh", chrono.zh.strict],
        ["zh.hans", chrono.zh.hans.casual],
        ["zh.hans", chrono.zh.hans.strict],
        ["zh.hant", chrono.zh.hant.casual],
        ["zh.hant", chrono.zh.hant.strict],
    ];

    for (const [name, entry] of entries) {
        const results = entry.parse(text, REF_DATE);
        expect(results.length).toBeGreaterThan(0);
        for (const result of results) {
            const localeTags = Array.from(result.tags()).filter((tag) => tag.startsWith("locale/"));
            expect(localeTags).toEqual([`locale/${name}`]);
            expect(result.start.tags()).toContain(`locale/${name}`);
        }
    }

    // Top-level shortcuts
    expect(chrono.parse(text, REF_DATE)[0].tags()).toContain("locale/en");
    expect(chrono.de.parse(text, REF_DATE)[0].tags()).toContain("locale/de");
    expect(chrono.ja.casual.parse(text, REF_DATE)[0].tags()).toContain("locale/ja");
    expect(chrono.zh.hant.parse(text, REF_DATE)[0].tags()).toContain("locale/zh.hant");
});

test("Test - Locale tag is set on both start and end components", () => {
    const results = chrono.parse("March 5-6, 2024", REF_DATE);
    expect(results).toHaveLength(1);
    expect(results[0].end).not.toBeNull();
    expect(results[0].start.tags()).toContain("locale/en");
    expect(results[0].end.tags()).toContain("locale/en");

    const deResults = chrono.de.parse("5. - 6. März 2024", REF_DATE);
    expect(deResults).toHaveLength(1);
    expect(deResults[0].start.tags()).toContain("locale/de");
    expect(deResults[0].end.tags()).toContain("locale/de");
});

test("Test - Configurations created by users carry the locale tag", () => {
    const customDe = new chrono.Chrono(chrono.de.createCasualConfiguration());
    expect(customDe.parse("2024-03-08", REF_DATE)[0].tags()).toContain("locale/de");

    const customDeStrict = new chrono.Chrono(chrono.de.createConfiguration());
    expect(customDeStrict.parse("2024-03-08", REF_DATE)[0].tags()).toContain("locale/de");

    const customGB = new chrono.Chrono(chrono.en.configuration.createCasualConfiguration(true));
    expect(customGB.parse("2024-03-08", REF_DATE)[0].tags()).toContain("locale/en.GB");

    const customZhHant = new chrono.Chrono(chrono.zh.hant.createCasualConfiguration());
    expect(customZhHant.parse("2024-03-08", REF_DATE)[0].tags()).toContain("locale/zh.hant");

    // The default (no-argument) Chrono is the English casual configuration
    const defaultChrono = new chrono.Chrono();
    expect(defaultChrono.parse("2024-03-08", REF_DATE)[0].tags()).toContain("locale/en");
});
