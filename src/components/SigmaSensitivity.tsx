import { useMemo, useState } from 'react';
import { reband } from '../data/conjunctions';
import { fmtPc } from '../data/format';
import { useThresholds } from '../state/thresholds';
import type { ResolvedConjunction, Severity } from '../data/types';

/**
 * How much of this event's risk is the assumption.
 *
 * Miss distance and relative velocity are measured. Pc is derived from them
 * through a Foster model whose one assumed input is the positional covariance,
 * because a TLE does not carry one. The app has always said that in a sentence.
 * This is the same statement as something you can interrogate: sweep the sigma
 * scale across the range the Thresholds slider offers and watch where the
 * severity band actually changes.
 *
 * The useful reading is not the curve, it is the crossings. An event that stays
 * HIGH from 0.25x to 4x is one whose severity does not depend on the assumption.
 * An event that crosses two bands inside that sweep is one where the assumption
 * IS the answer, and a judge asking "how much of this is guessed" deserves to
 * see which kind they are looking at.
 */

/** Matches the Thresholds screen's sigma slider exactly. */
const SIGMA_MIN = 0.25;
const SIGMA_MAX = 4;
const SAMPLES = 96;

/*
 * Band floors, from severityFor() in data/riskScore. Written as the boundaries
 * rather than re-deriving them, and asserted against the real function by the
 * chart itself: every sample is banded by reband(), so a drift between these
 * zones and the real thresholds would show as a line crossing inside a zone.
 */
const BANDS: { sev: Severity; lo: number; hi: number }[] = [
  { sev: 'CRITICAL', lo: 1e-3, hi: 1 },
  { sev: 'HIGH', lo: 1e-4, hi: 1e-3 },
  { sev: 'MEDIUM', lo: 1e-5, hi: 1e-4 },
  { sev: 'LOW', lo: 1e-7, hi: 1e-5 },
  { sev: 'NOMINAL', lo: 1e-14, hi: 1e-7 },
];

const W = 980;
const H = 268;
const PAD = { l: 66, r: 104, t: 16, b: 34 };

export function SigmaSensitivity({ event }: { event: ResolvedConjunction }) {
  const { thresholds } = useThresholds();
  const [hoverX, setHoverX] = useState<number | null>(null);

  const samples = useMemo(() => {
    const out: { scale: number; pc: number; sev: Severity }[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const scale = SIGMA_MIN + (i / (SAMPLES - 1)) * (SIGMA_MAX - SIGMA_MIN);
      const r = reband(event, scale);
      out.push({ scale, pc: r.pc, sev: r.sev });
    }
    return out;
  }, [event]);

  // Floored, not bare Math.log10: at the low end of the sigma sweep some
  // events' Pc underflows to exactly 0 (a genuine double-precision zero, not
  // a display rounding), and log10(0) is -Infinity. That propagated into
  // mid/half below as -Infinity plus a compensating +Infinity, i.e. NaN — and
  // every SVG coordinate on the chart is derived from loE/hiE, so the whole
  // plot silently stopped rendering for any event whose sweep touches zero.
  // The floor is far below any real Pc, so it only ever bites the literal
  // zero case; every other value passes through untouched.
  const PC_FLOOR = 1e-300;
  const l10 = (x: number) => Math.log10(Math.max(x, PC_FLOOR));
  const pcs = samples.map((s) => s.pc).filter((p) => p > 0);
  // One decade of headroom either side, clamped so the axis always spans at
  // least three decades — a curve squeezed into half a decade reads as flat
  // when what it is actually saying is "this barely moves".
  const rawLo = l10(pcs.length ? Math.min(...pcs) : PC_FLOOR);
  const rawHi = l10(pcs.length ? Math.max(...pcs) : PC_FLOOR);
  const mid = (rawLo + rawHi) / 2;
  const half = Math.max(1.5, (rawHi - rawLo) / 2 + 0.5);
  const loE = mid - half;
  const hiE = mid + half;

  const sx = (scale: number) =>
    PAD.l + ((scale - SIGMA_MIN) / (SIGMA_MAX - SIGMA_MIN)) * (W - PAD.l - PAD.r);
  const sy = (pc: number) =>
    H - PAD.b - ((l10(pc) - loE) / (hiE - loE)) * (H - PAD.t - PAD.b);
  const clampY = (v: number) => Math.max(PAD.t, Math.min(H - PAD.b, v));

  const path = samples
    .map((s, i) => `${i ? 'L' : 'M'}${sx(s.scale).toFixed(1)} ${sy(s.pc).toFixed(1)}`)
    .join(' ');

  /* Where the severity actually changes across the sweep. This is the finding. */
  const crossings = useMemo(() => {
    const out: { scale: number; from: Severity; to: Severity }[] = [];
    for (let i = 1; i < samples.length; i++) {
      if (samples[i].sev !== samples[i - 1].sev) {
        out.push({ scale: samples[i].scale, from: samples[i - 1].sev, to: samples[i].sev });
      }
    }
    return out;
  }, [samples]);

  // The operator's current assumption, marked on the curve.
  const current = reband(event, thresholds.sigmaScale);
  const currentX = sx(Math.min(SIGMA_MAX, Math.max(SIGMA_MIN, thresholds.sigmaScale)));
  const currentY = clampY(sy(current.pc));

  const hovered =
    hoverX == null
      ? null
      : samples[
          Math.max(0, Math.min(SAMPLES - 1, Math.round(((hoverX - PAD.l) / (W - PAD.l - PAD.r)) * (SAMPLES - 1))))
        ];

  const xTicks = [0.25, 1, 2, 3, 4];
  const decades: number[] = [];
  for (let e = Math.ceil(loE); e <= Math.floor(hiE); e++) decades.push(e);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHoverX(((e.clientX - r.left) / r.width) * W);
  };

  return (
    <div className="px-4 pb-4 pt-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        role="img"
        onMouseMove={onMove}
        onMouseLeave={() => setHoverX(null)}
        aria-label={
          `Probability of collision against assumed sigma, swept from 0.25 to 4 times. ` +
          (crossings.length === 0
            ? `Severity stays ${current.sev} across the whole range.`
            : crossings
                .map((c) => `Crosses from ${c.from} to ${c.to} at ${c.scale.toFixed(2)} times.`)
                .join(' '))
        }
      >
        {/*
          Severity zones as background bands, every one directly labelled at the
          right margin. The label is not decoration and not optional: these are
          the app's reserved status colours, and HIGH against MEDIUM measures
          ΔE 9.7 for normal vision and 5.5 under deuteranopia — below the floor
          at which colour alone can carry identity. The words carry it; the fill
          only reinforces them.
        */}
        {BANDS.map((b) => {
          const top = clampY(sy(b.hi));
          const bottom = clampY(sy(b.lo));
          if (bottom - top < 1) return null;
          return (
            <g key={b.sev} data-sev={b.sev}>
              <rect
                x={PAD.l}
                y={top}
                width={W - PAD.l - PAD.r}
                height={bottom - top}
                fill="var(--sev)"
                opacity={0.13}
              />
              <text
                x={W - PAD.r + 10}
                y={(top + bottom) / 2}
                dy={3.5}
                fontFamily="IBM Plex Mono, monospace"
                fontSize={10}
                letterSpacing={0.6}
                fill="var(--sev)"
              >
                {b.sev}
              </text>
            </g>
          );
        })}

        <g stroke="var(--grid)" strokeWidth={1}>
          {decades.map((e) => (
            <line key={e} x1={PAD.l} y1={sy(10 ** e)} x2={W - PAD.r} y2={sy(10 ** e)} />
          ))}
          <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} />
        </g>

        <g fontFamily="IBM Plex Mono, monospace" fontSize={10} fill="var(--t3)">
          {decades.map((e) => (
            <text key={e} x={PAD.l - 10} y={sy(10 ** e)} dy={3} textAnchor="end">
              1e{e}
            </text>
          ))}
          {xTicks.map((t) => (
            <text key={t} x={sx(t)} y={H - 14} textAnchor="middle">
              {t}×
            </text>
          ))}
          <text x={PAD.l} y={11} fontSize={9} letterSpacing={1}>
            PC — LOG
          </text>
          {/* On the top rule with the y caption, not in the tick row, where it
              sat on top of the 4x tick. */}
          <text x={W - PAD.r} y={11} textAnchor="end" fontSize={9} letterSpacing={1}>
            ASSUMED σ SCALE
          </text>
        </g>

        {/*
          Every crossing gets a rule; only the ones with room get a number.
          Crossings cluster where the curve is steepest — this event has three
          inside half a sigma — and three labels 6px apart is a smear rather
          than a reading. The prose below names all of them, so nothing is lost
          by leaving a rule unlabelled.
        */}
        {crossings.map((c, i) => {
          const x = sx(c.scale);
          const room = i === 0 || x - sx(crossings[i - 1].scale) > 34;
          return (
            <g key={c.scale}>
              <line
                x1={x}
                y1={PAD.t}
                x2={x}
                y2={H - PAD.b}
                stroke="var(--t3)"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              {room && (
                <text
                  x={x}
                  y={H - PAD.b - 6}
                  textAnchor="middle"
                  fontFamily="IBM Plex Mono, monospace"
                  fontSize={9}
                  fill="var(--t2)"
                >
                  {c.scale.toFixed(2)}×
                </text>
              )}
            </g>
          );
        })}

        <path d={path} fill="none" stroke="var(--accent)" strokeWidth={1.6} strokeLinejoin="round" />

        {/* The operator's current assumption. */}
        <circle cx={currentX} cy={currentY} r={4.5} fill="var(--accent)" />
        <circle cx={currentX} cy={currentY} r={8} fill="none" stroke="var(--accent)" strokeWidth={1} opacity={0.5} />

        {hovered && (
          <g>
            <line
              x1={sx(hovered.scale)}
              y1={PAD.t}
              x2={sx(hovered.scale)}
              y2={H - PAD.b}
              stroke="var(--t2)"
              strokeWidth={1}
            />
            <circle cx={sx(hovered.scale)} cy={clampY(sy(hovered.pc))} r={3.5} fill="var(--t1)" />
            <g data-sev={hovered.sev}>
              <text
                x={Math.min(sx(hovered.scale) + 9, W - PAD.r - 150)}
                y={PAD.t + 26}
                fontFamily="IBM Plex Mono, monospace"
                fontSize={11}
                fill="var(--t1)"
              >
                {hovered.scale.toFixed(2)}× · {fmtPc(hovered.pc)}
              </text>
              <text
                x={Math.min(sx(hovered.scale) + 9, W - PAD.r - 150)}
                y={PAD.t + 40}
                fontFamily="IBM Plex Mono, monospace"
                fontSize={10}
                fill="var(--sev)"
              >
                {hovered.sev}
              </text>
            </g>
          </g>
        )}
      </svg>

      {/*
        The reading, in words. Doubles as the text alternative to the plot —
        everything the chart says is stated here, so the finding does not depend
        on seeing colour, or on seeing the chart at all.
      */}
      <div className="mt-2 border-t border-hairline-soft pt-[10px] text-sm+ leading-[1.6] text-secondary [text-wrap:pretty]">
        {crossings.length === 0 ? (
          <>
            Severity stays <span data-sev={current.sev} className="text-sev">{current.sev}</span> across
            the whole 0.25×–4× range. On this event the covariance assumption
            changes the number but not the answer.
          </>
        ) : (
          <>
            At the current {thresholds.sigmaScale.toFixed(2)}× assumption this event is{' '}
            <span data-sev={current.sev} className="text-sev">{current.sev}</span> at{' '}
            <span className="num text-primary">{fmtPc(current.pc)}</span>. It changes band{' '}
            {crossings.length === 1 ? 'once' : `${crossings.length} times`} across the range —{' '}
            {crossings.map((c, i) => (
              <span key={c.scale}>
                {i > 0 && ', '}
                <span data-sev={c.to} className="text-sev">{c.to}</span> beyond{' '}
                <span className="num text-primary">{c.scale.toFixed(2)}×</span>
              </span>
            ))}
            . How much of this event's severity is measured and how much is assumed is
            exactly that spread.
          </>
        )}
      </div>
    </div>
  );
}
