import React from 'react'
import { SearchCard } from './SearchCard'
import { heroImage } from '../data/home'

export function Hero() {
  return (
    <section id="top" className="relative w-full">
      <div className="relative min-h-[620px] w-full overflow-hidden md:min-h-[680px] lg:min-h-[760px]">
        <img
          src={heroImage}
          alt="A private backyard pool at golden hour surrounded by palms and warm stone decking"
          className="absolute inset-0 h-full w-full object-cover"
          /* PORT NOTE: add width/height + srcset. 33 of 38 live images ship
             without dimensions today — do not add a 39th. */
        />
        <div className="absolute inset-0 bg-water-950/45" aria-hidden="true" />
        <div className="absolute inset-x-0 top-0 h-56 bg-water-950/40" aria-hidden="true" />

        <div className="relative mx-auto flex min-h-[620px] w-full max-w-7xl flex-col justify-end px-5 pb-40 pt-28 md:min-h-[680px] md:pb-44 lg:min-h-[760px] lg:px-10 lg:pb-48">
          <div className="max-w-2xl">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
              Private pools by the hour
            </p>
            <h1 className="text-[40px] font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Rent a pool you'll fall in love with.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/85 lg:text-lg">
              Private pools by the hour. Real neighbors. Real backyards. Book your
              escape nearby.
            </p>
          </div>
        </div>
      </div>

      <div className="relative z-20 mx-auto -mt-28 w-full max-w-5xl px-5 lg:-mt-24 lg:px-10">
        <SearchCard />
      </div>
    </section>
  )
}
