/**
 * Every user-facing string on the site lives here and nowhere else.
 *
 * Rules that bind this file (spec 2.3.5, 16.5, Appendix B; contract A1-A4):
 *  - No em dash. Use commas, colons, parentheses, or separate sentences.
 *  - No emoji.
 *  - No invented numbers, user counts, partnerships, funding, clinical status,
 *    or wet-lab claims. If the spec does not source a claim, it is not here.
 *  - Any surviving "100%" sits within 60 characters of the word "curated".
 *  - No visible email address anywhere.
 */

export const GITHUB_URL = 'https://github.com/markandeyay/constructsite';

export const copy = {
  meta: {
    title: 'Construct: validated genetic designs from plain English',
    description:
      'Construct turns plain-English intent into validated, ready-to-build genetic designs. Plasmids, viral vectors, mRNA, antibodies, and CAR-T constructs, checked by a deterministic validation engine.',
    ogTitle: 'Construct',
    ogDescription: 'Describe what you want to build. Get a design you can order.',
  },

  header: {
    nav1: 'How it works',
    nav2: 'What it builds',
    nav3: 'Contact',
    ghost: 'View the code',
    skip: 'Skip to content',
    wordmark: 'Construct',
  },

  hero: {
    kicker: 'DESIGN AUTOMATION FOR BIOLOGY',
    h1a: 'Describe what you want to build.',
    h1b: 'Get a design you can order.',
    lede:
      'Construct turns plain-English intent into validated, ready-to-build genetic designs. Work that takes an expert days now takes minutes.',
    cta1: 'See how it works',
    cta2: 'Read the code',
    status: 'LIVE · OPEN SOURCE · MIT LICENSED',
  },

  problem: {
    num: '02',
    kicker: 'THE COST',
    title: 'Design is the bottleneck.',
    body1:
      'This design work sits at the start of nearly every experiment and drug program, and today it is done by hand. A researcher picks parts from thousands of options, checks that everything fits together, and confirms the result can actually be manufactured.',
    body2:
      'Mistakes are expensive. A flawed design can cost weeks of lab time and thousands of dollars in wasted materials, and you often do not find out until the experiment has already failed.',
  },

  how: {
    num: '03',
    kicker: 'THE PIPELINE',
    title: 'From a sentence to a sequence.',
    steps: [
      {
        label: 'Describe',
        line: 'A researcher types what they want, in normal English.',
      },
      {
        label: 'Retrieve',
        line: 'We find real, existing designs that match the request.',
      },
      {
        label: 'Generate',
        line: 'We propose a design grounded in those real records, not invented from nothing.',
      },
      {
        label: 'Validate',
        line: 'A rules engine checks it against biology and manufacturing constraints.',
      },
      {
        label: 'Export',
        line: 'You get files you can send to a DNA manufacturer, plus instructions for the bench.',
      },
    ],
    chip1: 'GenBank',
    chip2: 'FASTA',
    chip3: 'Bench protocol',
  },

  outputs: {
    num: '04',
    kicker: 'OUTPUTS',
    title: 'What Construct builds.',
    cards: [
      {
        title: 'Lab workhorses',
        body:
          'The everyday constructs behind almost every molecular biology experiment, designed and checked in minutes.',
        detail:
          'Plasmids · Expression constructs · Codon optimization · Primers and assembly plans',
      },
      {
        title: 'Gene editing',
        body:
          'Targeting sequences for editing experiments, with the checks that keep them specific.',
        detail: 'CRISPR guide RNAs',
      },
      {
        title: 'Gene and RNA therapy',
        body:
          'The delivery vehicles and sequences behind modern therapeutics, where hard size and structure limits decide what is possible.',
        detail: 'Viral vectors (AAV, lentivirus) · mRNA constructs',
      },
      {
        title: 'Therapeutic proteins and cell therapy',
        body:
          'Formats for the largest classes of biologic medicine, including engineered immune cells.',
        detail: 'Antibody and nanobody constructs · CAR-T constructs',
      },
      {
        title: 'Programmable biology',
        body:
          'Multi-part designs where cells sense, decide, or manufacture, rather than simply express one gene.',
        detail: 'Genetic circuits · Metabolic pathways',
      },
    ],
    detailsLabel: 'Technical detail',
    closing:
      'Every one of these is a sequence under constraints. We built the engine that turns intent into a validated sequence. The rest is new constraint sets, not a new company.',
  },

  validation: {
    num: '05',
    kicker: 'VALIDATION',
    title: 'Checked by rules, not guesses.',
    body1:
      'A language model can write something that looks like a genetic design. That is not the same as a design you can order and build.',
    body2:
      'Every output from Construct passes through a deterministic validation engine. It checks restriction-site conflicts, repeat and synthesis instability, codon usage, and whether the regulatory parts are compatible with each other and with the host. The engine follows fixed rules, so the same design always produces the same verdict, and every verdict comes with the reason behind it.',
    body3:
      'Validation is not a pass/fail stamp. Real plasmids can carry intentional architecture that should be flagged and explained rather than rejected, so the report tells you what it found and why it matters.',
    goldset: '36 known-good · 52 known-bad · 100% combined accuracy on the curated set',
    rows: [
      { label: 'RESTRICTION SITE CONFLICTS' },
      { label: 'REPEAT / SYNTHESIS INSTABILITY' },
      { label: 'CODON USAGE FIT' },
      { label: 'REGULATORY COMPATIBILITY' },
    ],
    pass: 'PASS',
    warn: 'WARN',
  },

  structure: {
    num: '06',
    kicker: 'DOWNSTREAM',
    title: 'A sequence becomes a thing.',
    body:
      'The designs Construct writes do not stay on a screen. They get synthesized, put into cells, and folded into proteins that do the work. By then, a mistake in the design is a mistake in a physical object that took weeks and real money to make. That is why the checking happens first.',
    caption: 'Green fluorescent protein (PDB 1EMA), a reporter protein used throughout molecular biology.',
    pdbcredit: 'Structure from the RCSB Protein Data Bank, entry 1EMA.',
  },

  traction: {
    num: '07',
    kicker: 'WHERE WE ARE',
    title: 'Built, not proposed.',
    items: [
      {
        h: 'Live today',
        b: 'The full pipeline runs end to end. Describe, retrieve, generate, validate, export.',
      },
      {
        h: 'Grounded in real data',
        b: "Built on Addgene's plasmid repository, the field's most comprehensive dataset, which is the corpus our retrieval runs against.",
      },
      {
        h: 'Open',
        b: 'MIT licensed and public on GitHub, so the engine can be read, not just described.',
      },
      {
        h: 'Validated',
        b: '100% combined accuracy across a curated gold set of known-good and known-bad constructs.',
      },
    ],
  },

  contact: {
    num: '08',
    kicker: 'GET IN TOUCH',
    title: 'Work with us.',
    intro:
      'If you run a lab and want early access, if you are building something where design is the slow step, or if you want to talk about working together, send us a note. It reaches us directly.',
    submit: 'Send',
    pending: 'Sending',
    success: 'Sent. We will reply to {email}.',
    error: 'Something went wrong. Please try again in a moment.',
    unwired: 'Mail line not wired yet.',
    fields: {
      name: 'Name',
      email: 'Email',
      org: 'Organization',
      orgHint: 'Lab, company, or university. Optional.',
      subject: 'Subject',
      message: 'Message',
    },
    options: ['Early access', 'Partnership', 'Investment', 'Press', 'Something else'],
    errors: {
      required: 'This field is required.',
      email: 'Enter a valid email address.',
    },
  },

  footer: {
    left: 'Construct. Chapel Hill, NC.',
    right: 'GitHub · 2026',
  },
} as const;
