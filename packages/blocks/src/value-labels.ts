/**
 * The English names of the values a block's choice settings take, for editors (the Studio's Properties and block bar):
 * "Info" for `info`, "Author–date" for `author-date`, "Sections and subsections" for a contents depth of `3`. The
 * Czech names are in `BLOCKS_CS` (`i18n.ts`); the values themselves are the syntax and are never translated. Every
 * value with a Czech name has an English one here and the other way round (tested).
 */
export interface ValueLabels {
  attributes?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** Child directives (`button`, `field` ...), with their attributes. */
  children?: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, string>>>>>>;
}

const status = { info: 'Info', success: 'Success', warning: 'Warning', error: 'Error' };
const states = { default: 'Default', hover: 'Hover', focus: 'Focus', disabled: 'Disabled' };

export const VALUE_LABELS_EN: Readonly<Record<string, ValueLabels>> = {
  toc: { attributes: { depth: { 2: 'Sections', 3: 'Sections and subsections' } } },
  references: { attributes: { style: { numeric: 'Numbered', 'author-date': 'Author–date' } } },
  section: { attributes: { break: { page: 'New page', none: 'No break' } } },
  callout: { attributes: { variant: { ...status, note: 'Note', tip: 'Tip', important: 'Important', caution: 'Caution' } } },
  flow: { attributes: { shape: { linear: 'Linear', cycle: 'Cycle' } } },
  matrix: { attributes: { type: { swot: 'SWOT', grid: 'Grid' } } },
  summary: { attributes: { source: { human: 'A person', ai: 'AI' } } },
  cta: { attributes: { variant: { primary: 'Primary', secondary: 'Secondary' } } },
  decision: { attributes: { status: { proposed: 'Proposed', accepted: 'Accepted', rejected: 'Rejected', superseded: 'Superseded' } } },
  chart: { attributes: { type: { bar: 'Bar', line: 'Line', donut: 'Donut' } } },
  ui: {
    attributes: { theme: { light: 'Light', dark: 'Dark', both: 'Both' }, layout: { row: 'In a row', stack: 'Stacked' } },
    children: {
      button: {
        variant: { primary: 'Primary', accent: 'Accent', iris: 'Iris', secondary: 'Secondary', destructive: 'Destructive', ghost: 'Ghost' },
        state: { ...states, loading: 'Loading' },
      },
      field: {
        type: { text: 'Text', email: 'Email', 'password': 'Password', number: 'Number', textarea: 'Text area', select: 'Select', checkbox: 'Checkbox', radio: 'Radio button', switch: 'Switch' },
        state: { ...states, readonly: 'Read-only' },
      },
      badge: { variant: { neutral: 'Neutral', ...status, ai: 'AI' } },
      toast: { variant: status },
    },
  },
};

/** The English names of a setting's values (by value), or nothing when it has none. */
export function valueLabelsEn(block: string, key: string, child?: string): Readonly<Record<string, string>> | undefined {
  const b = VALUE_LABELS_EN[block];
  return child ? b?.children?.[child]?.[key] : b?.attributes?.[key];
}
