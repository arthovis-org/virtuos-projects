import type { RecordedRun } from '../runner';

/**
 * The product launch team's demo run, written ahead (by Claude, while developing): plays back
 * through the same runner as a live run, the same every time, with no AI service. For demos
 * and videos. Sources are real Wikipedia articles; figures are marked as estimates.
 */
export const PRODUCT_LAUNCH_DEMO: RecordedRun = {
  goal: 'Launch our new VIRTUOS smart desk in Europe',
  summary:
    'Ava maps the market and Mia sets the look in parallel; Sam sizes and prices it from Ava’s research, and Leo writes the launch from both.',
  tasks: [
    {
      id: 't1',
      agent: 'ava',
      title: 'European market research',
      brief: 'Find who buys sit-stand desks in Europe and why, for the team to build on.',
      dependsOn: [],
      steps: [
        { kind: 'research', title: 'Who buys sit-stand desks', search: 'standing desk' },
        { kind: 'research', title: 'The health angle', search: 'ergonomics' },
        { kind: 'write', title: 'Research brief for the team' },
      ],
    },
    {
      id: 't2',
      agent: 'mia',
      title: 'Brand visual direction',
      brief: 'Set the launch look: palette, type and the key visuals.',
      dependsOn: [],
      steps: [
        { kind: 'research', title: 'Nordic design language', search: 'Scandinavian design' },
        { kind: 'design', title: 'Palette and type' },
        { kind: 'design', title: 'Launch visuals' },
      ],
    },
    {
      id: 't3',
      agent: 'sam',
      title: 'Sizing and pricing',
      brief: 'Estimate demand by market and set the price tiers.',
      dependsOn: ['t1'],
      steps: [
        { kind: 'analyze', title: 'Where to launch first' },
        { kind: 'analyze', title: 'Price tiers' },
        { kind: 'write', title: 'First-year outlook' },
      ],
    },
    {
      id: 't4',
      agent: 'leo',
      title: 'Launch copy',
      brief: 'Write the headline, tagline and announcement in the brand’s voice.',
      dependsOn: ['t1', 't2'],
      steps: [
        { kind: 'write', title: 'Headline and tagline' },
        { kind: 'write', title: 'Launch announcement' },
        { kind: 'review', title: 'Final check' },
      ],
    },
  ],
  steps: {
    't1/0': {
      note: 'Reading about standing desks',
      sources: [{ title: 'Standing desk', url: 'https://en.wikipedia.org/wiki/Standing_desk' }],
      content: `## What a sit-stand desk is
- A desk used while standing, or **height-adjustable** to switch between sitting and standing through the day (Standing desk).
- Electric, motorised models make the switch a button press, which is what turns occasional use into a habit.

## Who buys them
- **Knowledge workers** at home: remote and hybrid work moved desk buying from the office to the household.
- **Companies refitting offices** for shared desks, where one desk must fit every height.
- **Gamers and creators** with multi-screen setups, who want one surface that does everything.

## Takeaways
1. Lead with the *switch*, not the standing: comfort all day.
2. Home buyers decide on looks as much as on specs.`,
    },
    't1/1': {
      note: 'Reading about ergonomics',
      sources: [
        { title: 'Ergonomics', url: 'https://en.wikipedia.org/wiki/Ergonomics' },
        { title: 'Sedentary lifestyle', url: 'https://en.wikipedia.org/wiki/Sedentary_lifestyle' },
      ],
      content: `## The health angle
- **Ergonomics** fits the workplace to the person, not the other way round: screen height, reach and posture (Ergonomics).
- Long sitting is part of a **sedentary lifestyle**, linked to health risks; breaking it up is the common advice (Sedentary lifestyle).

## What this means for VIRTUOS
- The integrated monitors move **with** the desk: screen height stays right when you stand, which most desks leave to separate arms.
- Height presets (**Sit 72 · Stand 110**) make the healthy habit effortless.

## Careful with claims
- Talk about **comfort and movement**, not medical outcomes: European advertising rules are strict on health claims.`,
    },
    't1/2': {
      note: 'Writing the research brief',
      sources: [],
      content: `## Research brief
**Audience:** hybrid knowledge workers furnishing a home office, and teams refitting shared offices.

**Why they buy:** comfort through the day, a tidy setup, and a desk that adapts to whoever uses it.

**Our edge:** the only desk where **all the screens rise with you**: main, sides and the desk display.

**Launch markets to test:** Germany, the Netherlands and the Nordics: large home-office audiences with a taste for well-made design.

**Message pillars**
1. *Move more, without thinking about it.*
2. *One surface for every screen.*
3. *Built to look calm in your home.*

Handing this to **Sam** for sizing and **Leo** for copy.`,
    },
    't2/0': {
      note: 'Reading about Scandinavian design',
      sources: [
        { title: 'Scandinavian design', url: 'https://en.wikipedia.org/wiki/Scandinavian_design' },
      ],
      content: `## Nordic design language
- **Simplicity, minimalism and function**, from the Nordic countries' design movement of the mid-20th century (Scandinavian design).
- Natural materials, light woods, soft neutral colours, nothing that doesn't earn its place.

## Fit with VIRTUOS
- Oak and walnut desk tops already speak this language.
- The screens are the risk: black glass reads *gaming*. Frame them as part of calm furniture.

## Direction
- Warm daylight, real homes, a plant or two.
- Product shots at eye level, never from a dramatic low angle.`,
    },
    't2/1': {
      note: 'Choosing the palette and type',
      sources: [],
      content: `## Palette
- Ink #1C1C22: text and the desk frame
- Oak #C8A97E: warmth, from the desk top
- Fog #EEF0F2: backgrounds
- Nordic blue #4C6FFF: one accent, for buttons and links
- Moss #5E7D63: secondary accent, used sparingly

## Type
- **Inter**, two weights only: Regular for text, Semibold for headlines.
- Large, calm headlines; generous white space.

## Mood
*Quiet, warm, precise.*`,
    },
    't2/2': {
      note: 'Sketching the launch visuals',
      sources: [],
      content: `## Key visuals
1. **The rise:** the same desk sitting, then standing, screens moving with it. One image, split down the middle.
2. **The calm room:** a light Nordic home office, desk at standing height, morning sun.
3. **Every screen:** close-up of the main, side and desk displays working together.

## Layout options
- **Hero:** headline left, product right, Oak #C8A97E as the only warm tone.
- **Grid:** three features, each with one photo and one line.

Handing the direction to **Leo** for the words.`,
    },
    't3/0': {
      note: 'Estimating demand by market',
      sources: [],
      content: `## Where to launch first
Built on Ava's brief. *Figures are illustrative estimates for planning, not market data.*

| Market | Home-office fit | Design affinity | Priority |
| --- | --- | --- | --- |
| Germany | High | High | **Launch** |
| Netherlands | High | High | **Launch** |
| Nordics | High | Very high | **Launch** |
| France | Medium | High | Wave 2 |
| UK | High | Medium | Wave 2 |

- Three launch markets share remote-work habits and a taste for Nordic design.
- Wave 2 follows once delivery and returns run smoothly.`,
    },
    't3/1': {
      note: 'Setting the price tiers',
      sources: [],
      content: `## Price tiers
*Estimates to test, in euros including VAT.*

| Tier | What's in it | Price |
| --- | --- | --- |
| Essential | Desk + main screen | €1,490 |
| Pro | + side monitors | €1,890 |
| Studio | + desk display, walnut | €2,290 |

- **Pro** is the tier to push: the side monitors are what makes VIRTUOS different.
- A 30-night home trial lowers the risk of buying a desk unseen.`,
    },
    't3/2': {
      note: 'Writing the first-year outlook',
      sources: [],
      content: `## First-year outlook
*An illustrative plan to set targets, not a forecast from data.*

- **Launch markets:** Germany, the Netherlands, the Nordics.
- **Mix to aim for:** 50% Pro, 30% Essential, 20% Studio.
- **What to measure weekly:** trial-to-keep rate, average order value, delivery time.

## Risks
- Delivery of a large item across borders: start with partners in each market.
- Returns during the trial: make set-up effortless to keep them low.

Sending the numbers to the team.`,
    },
    't4/0': {
      note: 'Drafting headline and tagline',
      sources: [],
      content: `## Headline options
1. **Every screen rises with you.**
2. **Sit. Stand. Keep working.**
3. **The desk that moves your whole setup.**

## Tagline
*VIRTUOS: calm, adjustable, all yours.*

## Recommendation
Option 1: it says what only VIRTUOS does, in five words. It works next to Mia's *rise* visual.`,
    },
    't4/1': {
      note: 'Writing the announcement',
      sources: [],
      content: `## Every screen rises with you
Today we're bringing **VIRTUOS** to Germany, the Netherlands and the Nordics.

Most standing desks lift the desk and leave your screens behind. VIRTUOS moves **everything**: the main screen, the side monitors and the desk display rise and fall together, so your setup stays right whether you sit or stand.

Press **Sit** or **Stand**, and keep working. In oak or walnut, it's made to look calm in your home as well as your office.

**Try it at home for 30 nights.** From €1,490.`,
    },
    't4/2': {
      note: 'Checking the launch kit',
      sources: [],
      content: `## Final check
- ✅ Headline matches the key visual (the rise)
- ✅ Prices match Sam's tiers
- ✅ Launch markets match Ava's brief
- ✅ Palette and tone follow Mia's direction
- ⚠️ Health wording: keep to comfort and movement, no medical claims
- ⚠️ Confirm delivery partners before announcing dates

**Verdict:** ready for launch, once delivery dates are confirmed.`,
    },
  },
};
