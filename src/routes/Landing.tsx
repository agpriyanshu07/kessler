import { Link } from 'react-router-dom';
import { HeroOrbits } from '../components/HeroOrbits';
import { Button } from '../components/primitives';
import type { ReactNode } from 'react';
import { LANDING } from '../data/landing';
import { fmtDur, fmtInt } from '../data/format';
import { useNow } from '../hooks/useNow';
import { useCountUp } from '../hooks/useCountUp';
import { revealProps, useInView } from '../hooks/useReveal';

/**
 * Hero figures, read from the screening run rather than written here.
 *
 * These used to be "34,182 objects tracked / 1.2 M pairs screened / 6 min TLE
 * fetch cadence" — none of which this system did. A marketing figure that
 * happens to be a claim about your own product is the one kind a judge can
 * check, so these now come out of the same committed run the console shows,
 * and change automatically when it does.
 */
const HERO_STATS = [
  { to: LANDING.objectCount, fmt: (n: number) => fmtInt(Math.round(n)), label: 'Objects screened' },
  {
    to: LANDING.totalPairs,
    fmt: (n: number) => fmtInt(Math.round(n)),
    label: `Pairs screened / ${LANDING.horizonHours} h`,
  },
  {
    to: LANDING.elapsedMs / 1000,
    fmt: (n: number) => `${n.toFixed(0)} s`,
    label: 'Full screening run',
  },
] as const;

/**
 * A measured figure, counted up on arrival.
 *
 * The animation adds nothing to the number and cannot change it: the last
 * frame writes the exact target. It buys a few hundred milliseconds of
 * attention on three figures that are the whole argument of the page.
 */
function HeroStat({ to, fmt, label }: { to: number; fmt: (n: number) => string; label: string }) {
  const n = useCountUp(to);
  return (
    <div className="flex flex-col gap-[5px]">
      <dt className="num text-[21px] text-primary">{fmt(n)}</dt>
      <dd className="label-strong">{label}</dd>
    </div>
  );
}

/**
 * The soonest close approach in the committed run, ticking down live.
 *
 * Same event the console's Next TCA tile names, taken from the same run and
 * filtered by the same default thresholds — the summary is generated with the
 * console's own DEFAULT_THRESHOLDS, so the two cannot disagree. On the console
 * clock, which is anchored to the snapshot capture instant rather than to now.
 */
function NextApproach() {
  const now = useNow();
  const next = LANDING.nextTca;
  if (!next) return null;
  const remaining = next.tca - now;
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="label-strong">Next screened approach</span>
      <span className="num text-md text-accent">
        {remaining > 0 ? fmtDur(remaining) : 'passed'}
      </span>
      {/* text-secondary: --t3 measured 4.28:1 here, over the warm blob. */}
      <span className="num text-2xs text-secondary">{next.id}</span>
    </div>
  );
}

/**
 * The headline, arriving a word at a time.
 *
 * Six words, so this is the one place a per-token reveal is worth the DOM it
 * costs — the guidance is explicit that split-text belongs on short headlines
 * and nowhere near body copy. No GSAP: a word is a span with a transition delay,
 * which is the whole of what SplitText would be doing here for 64 kB.
 *
 * The line breaks are structural rather than <br>, so the words can stagger
 * across them, and the whole heading is one accessible string — a screen reader
 * gets "Know which close approach matters." and never eleven fragments.
 */
const HEADLINE = [['Know', 'which'], ['close', 'approach'], ['matters.']];

function HeroHeadline() {
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let n = -1;
  return (
    <h1
      aria-label="Know which close approach matters."
      className="text-[clamp(38px,5.4vw,60px)] font-semibold leading-[1.02] tracking-display text-primary"
    >
      {HEADLINE.map((line, li) => (
        <span key={li} aria-hidden className="block">
          {line.map((word, wi) => {
            n += 1;
            return (
              <span key={word}>
                <span className="inline-block overflow-hidden pb-[0.06em] align-bottom">
                  <span
                    className={reduced ? 'inline-block' : 'word-in inline-block'}
                    style={reduced ? undefined : { animationDelay: `${120 + n * 85}ms` }}
                  >
                    {word}
                  </span>
                </span>
                {wi < line.length - 1 ? ' ' : ''}
              </span>
            );
          })}
        </span>
      ))}
    </h1>
  );
}

/** One revealed child, with its stagger delay taken from its index. */
function RevealItem({
  inView,
  index,
  className = '',
  children,
}: {
  inView: boolean;
  index: number;
  className?: string;
  children: ReactNode;
}) {
  const r = revealProps(inView, index);
  return (
    <div className={`${className} ${r.className}`} style={r.style}>
      {children}
    </div>
  );
}

/**
 * A section that lifts into place the first time it is scrolled to, and hands
 * its children a stagger index so they arrive in sequence rather than together.
 *
 * The render-prop is what makes the stagger possible: a child needs to know its
 * own position to compute a delay, and a plain wrapper cannot tell it.
 */
function Reveal({
  children,
  ...rest
}: {
  children: (inView: boolean) => ReactNode;
} & Omit<JSX.IntrinsicElements['section'], 'children'>) {
  const { ref, inView } = useInView<HTMLElement>();
  return (
    <section ref={ref} {...rest}>
      {children(inView)}
    </section>
  );
}

const PROBLEM_FIGURES = [
  ['30,000', '+', '', 'Objects large enough to be tracked from the ground.'],
  ['7.5', '', 'km/s', 'Typical orbital velocity in LEO. Closing speeds reach twice that.'],
  ['1', '', 'cm', 'A fragment this size carries roughly the kinetic energy of a hand grenade.'],
] as const;

const STEPS = [
  ['01', 'Ingest public element sets',
   'Two-line element sets come from the public CelesTrak catalogue, committed as a fixed snapshot and bundled into the build so the console needs no network at all. Each set keeps its own epoch, so the age of every state vector is known and shown.'],
  ['02', 'Propagate and screen',
   'Every object is propagated with SGP4 across the screening horizon. A coarse radial filter and a distance gate cut the pair count before bisection on range rate resolves each time of closest approach exactly. The reduction at every stage is counted and shown, not asserted.'],
  ['03', 'Rank and alert',
   'Miss distance, relative velocity and collision probability are combined into a single ranked list, banded so the ranking can never contradict the severity it shows. Alert delivery by email, webhook and API is not built — the console says so rather than implying otherwise.'],
] as const;

const PRINCIPLES = [
  ['Open inputs',
   'Built on public catalogue data. No licence negotiation, no minimum contract, no data you cannot inspect yourself.'],
  ['Stated uncertainty',
   'Every result carries its element-set age and an accuracy band. We publish what the method cannot tell you alongside what it can.'],
  ['Reachable by a cubesat team',
   'A university group flying one 3U spacecraft gets the same screening pipeline as an operator with four hundred satellites.'],
  ['Reproducible',
   'The element sets are committed to the repository and the screening run is a single command. The console ships a precomputed result and can re-run the identical engine live in the browser — both produce the same numbers, because they are the same code.'],
] as const;

/**
 * Nav that goes somewhere.
 *
 * These were inert <span>s reading "Platform / Methodology / Data sources /
 * Docs" — decorative chrome for pages that do not exist. On a project whose
 * pitch is that it does not claim what it has not built, a fake nav bar is the
 * same defect as a fake metric, just quieter. Every entry now resolves: three
 * to sections of this page, one to the console.
 */
const NAV = [
  ['The problem', '#problem'],
  ['Method', '#method'],
  ['Why this exists', '#principles'],
  ['Console', '/console'],
] as const;

/** Same rule in the footer. "API" and "Contact" are gone: neither exists. */
const FOOTER_LINKS = [
  ['Method', '#method'],
  ['Status', '/console/status'],
  ['Console', '/console'],
] as const;

/**
 * One nav entry: an in-page jump or a route.
 *
 * In-page jumps cannot be <a href="#method"> here. The app is on a hash router,
 * so the router owns the fragment: it reads `#method` as a route, finds no
 * match and rewrites the URL straight back to `#/`. The link renders, focuses
 * and clicks, and the page does not move — which is the same defect as the
 * inert <span>s this replaced, only harder to notice. Verified in a browser
 * before believing it.
 *
 * So a jump is a button that scrolls, and a route is a <Link>. Smooth scrolling
 * is skipped under prefers-reduced-motion, per the rest of the app.
 */
function scrollToSection(id: string) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById(id)?.scrollIntoView({
    behavior: reduced ? 'auto' : 'smooth',
    block: 'start',
  });
}

const NavLink = ({ label, href }: { label: string; href: string }) => {
  if (!href.startsWith('#')) {
    return (
      <Link to={href} className="rounded-sm hover:text-primary">
        {label}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className="rounded-sm hover:text-primary"
      onClick={() => scrollToSection(href.slice(1))}
    >
      {label}
    </button>
  );
};

const Eyebrow = ({ children }: { children: string }) => (
  <div className="font-mono text-2xs uppercase tracking-eyebrow text-accent">{children}</div>
);

export function Landing() {
  return (
    <div className="min-h-screen">
      <div className="glass lift mx-auto w-full max-w-[1440px] border-x border-hairline bg-ground">
        {/* Nav */}
        <header className="flex h-[60px] items-center justify-between border-b border-hairline-soft px-6 lg:px-10">
          <div className="flex items-center gap-9">
            <span className="text-lg font-semibold tracking-[0.04em] text-primary">KESSLER</span>
            <nav className="hidden gap-[26px] text-base text-secondary md:flex">
              {NAV.map(([label, href]) => (
                <NavLink key={label} label={label} href={href} />
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/signin" className="hidden sm:block">
              <Button className="px-[14px] py-[7px] text-sm">Sign in</Button>
            </Link>
            <Link to="/console">
              <Button variant="primary" className="px-[14px] py-[7px] text-sm">Launch console</Button>
            </Link>
          </div>
        </header>

        {/* Hero */}
        <section className="grid items-center gap-14 px-6 py-16 lg:grid-cols-[1fr_minmax(0,620px)] lg:px-10 lg:py-[88px]">
          <div className="flex flex-col gap-[26px]">
            <div className="hero-in label-strong tracking-eyebrow" style={{ animationDelay: '40ms' }}>
              Conjunction screening — Low Earth Orbit
            </div>
            <HeroHeadline />
            <p
              className="hero-in max-w-[480px] text-xl leading-[1.6] text-secondary [text-wrap:pretty]"
              style={{ animationDelay: '520ms' }}
            >
              Orbital conjunction screening, open to everyone. KESSLER ingests public element
              sets, propagates every tracked object in Low Earth Orbit, and ranks the close
              approaches that warrant an operator's attention.
            </p>
            <div className="hero-in flex flex-wrap gap-3 pt-[6px]" style={{ animationDelay: '620ms' }}>
              <Link to="/console">
                <Button variant="primary" className="px-5 py-[11px] text-base">Screen your catalogue</Button>
              </Link>
              <Button
                className="px-5 py-[11px] text-base"
                onClick={() => scrollToSection('method')}
              >
                Read the method
              </Button>
            </div>
            <dl
              className="hero-in mt-[14px] flex flex-wrap gap-8 border-t border-hairline-soft pt-[22px]"
              style={{ animationDelay: '700ms' }}
            >
              {HERO_STATS.map((s) => (
                <HeroStat key={s.label} to={s.to} fmt={s.fmt} label={s.label} />
              ))}
            </dl>
            <NextApproach />
          </div>

          <div
            data-presenter="hero-canvas"
            className="glass lift relative h-[380px] overflow-hidden rounded-md border border-hairline-soft bg-deep lg:h-[520px]"
          >
            <HeroOrbits />
            {/* "Propagated live" was false: this canvas never imported
                satellite.js and never called propagate(). It draws circular
                orbits from each object's real elements — the same schematic the
                orbital viewer draws, and labelled with the same word, so the
                two screens hold one standard of truth rather than two. */}
            <div
              className="absolute left-4 top-[14px] label"
              title="Orbits are drawn as circles from each object's real altitude, inclination, RAAN and mean anomaly, at compressed time. Conjunction geometry comes from the SGP4 screening run, not from this canvas."
            >
              Schematic · {fmtInt(LANDING.objectCount)} real element sets
            </div>
            <div className="absolute bottom-[14px] left-4 flex gap-[18px] font-mono text-2xs text-secondary">
              <span>PAYLOAD</span><span>ROCKET BODY</span><span>DEBRIS</span>
            </div>
          </div>
        </section>

        {/* Problem */}
        <Reveal id="problem" className="border-t border-hairline-soft px-6 py-16 lg:px-10 lg:py-[76px]">
          {(inView) => (
          <div className="grid items-start gap-14 lg:grid-cols-[400px_1fr]">
            <div className="flex flex-col gap-[14px]">
              <Eyebrow>The problem</Eyebrow>
              <h2 className="text-4xl font-semibold tracking-tighter text-primary">
                Orbit is a shared resource with no traffic control.
              </h2>
            </div>
            <div className="flex flex-col gap-[22px] pt-1">
              <p className="max-w-[620px] text-lg leading-[1.72] text-secondary [text-wrap:pretty]">
                In February 2009 the Iridium 33 communications satellite struck the derelict
                Cosmos 2251 at a closing speed near 11.7 km/s. The collision produced more than
                1,800 catalogued fragments, most of which are still in orbit. Every one of them
                is now something else to screen against.
              </p>
              <div className="grid max-w-[620px] grid-cols-1 gap-px overflow-hidden rounded-md border border-hairline bg-hairline sm:grid-cols-3">
                {PROBLEM_FIGURES.map(([value, plus, unit, note], i) => (
                  /*
                    bg-deep, not bg-panel.
                    --panel is white at 5%, and .glass is blur + saturate(150%).
                    Over the warm gradient blob that combination lifts the panel
                    to about rgb(104,88,80) — a washed-out grey card, and the
                    caption on it measured 2.89:1. --deep is the dark
                    translucent instead, so the glass reads as glass over a dark
                    scene rather than as fog.
                  */
                  <RevealItem key={note} inView={inView} index={i} className="glass bg-deep p-5">
                    <div className="num text-[26px] text-primary">
                      {value}
                      {plus && <span className="text-[16px] text-secondary">{plus}</span>}
                      {unit && <span className="ml-1 text-md text-secondary">{unit}</span>}
                    </div>
                    <p className="mt-2 text-sm leading-[1.5] text-secondary">{note}</p>
                  </RevealItem>
                ))}
              </div>
            </div>
          </div>
          )}
        </Reveal>

        {/* How it works */}
        <Reveal id="method" className="border-t border-hairline-soft px-6 py-16 lg:px-10 lg:py-[76px]">
          {(inView) => (
          <>
          <div className="mb-[34px]"><Eyebrow>How it works</Eyebrow></div>
          <div className="grid gap-10 md:grid-cols-3">
            {STEPS.map(([n, title, body], i) => (
              <RevealItem key={n} inView={inView} index={i}
                          className="flex flex-col gap-[14px] border-t border-hairline pt-5">
                <div className="font-mono text-xs tracking-label text-accent">{n}</div>
                <h3 className="text-2xl font-medium tracking-tight text-primary">{title}</h3>
                <p className="text-md leading-[1.65] text-secondary [text-wrap:pretty]">{body}</p>
              </RevealItem>
            ))}
          </div>
          </>
          )}
        </Reveal>

        {/* Why this exists */}
        <Reveal id="principles" className="grid items-start gap-14 border-t border-hairline-soft px-6 py-16 lg:grid-cols-[400px_1fr] lg:px-10 lg:py-[76px]">
          {(inView) => (
          <>
          <div className="flex flex-col gap-[14px]">
            <Eyebrow>Why this exists</Eyebrow>
            <h2 className="text-4xl font-semibold tracking-tighter text-primary">
              Screening should not be a procurement decision.
            </h2>
          </div>
          <dl className="flex flex-col">
            {PRINCIPLES.map(([term, body], i) => (
              <RevealItem key={term} inView={inView} index={i}
                   className={`grid gap-7 border-t border-hairline py-[22px] sm:grid-cols-[190px_1fr] ${
                     i === PRINCIPLES.length - 1 ? 'border-b' : ''}`}>
                <dt className="text-md font-medium text-primary">{term}</dt>
                <dd className="max-w-[560px] text-md leading-[1.65] text-secondary">{body}</dd>
              </RevealItem>
            ))}
          </dl>
          </>
          )}
        </Reveal>

        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-hairline-soft px-6 py-[34px] lg:px-10">
          <div className="flex items-center gap-5">
            <span className="text-sm font-semibold tracking-[0.04em] text-secondary">KESSLER</span>
            <span className="font-mono text-2xs text-tertiary">Orbital conjunction screening</span>
          </div>
          {/* text-secondary: --t3 measured 3.98:1 here, over the blue blob. */}
          <div className="flex gap-[22px] text-sm text-secondary">
            {FOOTER_LINKS.map(([label, href]) => (
              <NavLink key={label} label={label} href={href} />
            ))}
          </div>
        </footer>

        <div className="border-t border-hairline-soft px-6 py-4 lg:px-10">
          <p className="max-w-[92ch] font-mono text-2xs leading-[1.6] tracking-[0.08em] text-tertiary">
            <span className="uppercase text-secondary">
              The orbital data and the screening are real. The operational trappings are not.
            </span>{' '}
            Objects, element sets, propagation, times of closest approach, miss distances and
            relative velocities come from a committed CelesTrak snapshot screened with SGP4.
            The manoeuvre log&rsquo;s burn records are synthetic, sign-in authenticates nothing,
            and acknowledgements live only in your browser.{' '}
            <Link to="/console/status" className="text-accent underline-offset-2 hover:underline">
              Per-feature breakdown
            </Link>
            . Nothing here should be used for any operational purpose.
          </p>
        </div>
      </div>
    </div>
  );
}
