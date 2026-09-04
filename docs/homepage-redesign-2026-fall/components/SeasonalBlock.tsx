import React from 'react'
import { ArrowUpRight } from 'lucide-react'
import { seasonalCards } from '../data/home'

/**
 * Fall/winter discovery. Cards with href === null have no destination page and
 * MUST NOT be rendered as links (verified 2026-09-04: /p/heated-pool-rentals is
 * 200; every indoor and winter candidate 404s). Rendering them as dead links
 * would be exactly the "junk link" the brief forbids.
 */
export function SeasonalBlock() {
  const linkable = seasonalCards.filter((c) => c.href)
  if (linkable.length === 0) return null

  return (
    <section className="w-full bg-water-950 py-16 lg:py-24">
      <div className="mx-auto w-full max-w-7xl px-5 lg:px-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-water-200/70">
          Off-season
        </p>
        <h2 className="mt-3 max-w-xl text-2xl font-semibold leading-tight tracking-tight text-white lg:text-4xl">
          Keep swimming when summer ends.
        </h2>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-water-200/80 lg:text-base">
          Indoor and heated backyards stay open long after the last warm weekend.
        </p>

        <ul className="mt-8 grid grid-cols-1 gap-5 lg:mt-12 lg:grid-cols-3 lg:gap-6">
          {linkable.map((c) => (
            <li key={c.title}>
              <a
                href={c.href!}
                data-beacon="homepage_seasonal_clicked"
                className="group flex h-full flex-col overflow-hidden rounded-2xl bg-water-900 ring-1 ring-white/10 transition-colors hover:ring-white/25"
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden">
                  <img src={c.image} alt="" loading="lazy"
                       className="h-full w-full object-cover opacity-90 transition-transform duration-500 group-hover:scale-[1.03]" />
                  <div className="absolute inset-0 bg-water-950/25" aria-hidden="true" />
                </div>
                <div className="flex flex-1 items-start justify-between gap-4 p-5">
                  <div>
                    <h3 className="text-lg font-semibold text-white">{c.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-water-200/75">{c.description}</p>
                  </div>
                  <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors group-hover:bg-white group-hover:text-water-900">
                    <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
