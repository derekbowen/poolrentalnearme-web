import React, { useMemo, useRef, useState } from 'react'
import { Calendar, ChevronDown, MapPin, PartyPopper, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
import { citySuggestions } from '../data/home'
import { resolveDestination } from '../resolveDestination'
import { beacon } from '../beacon'

const occasionOptions = [
  'Just swimming', 'Birthday party', 'Family day',
  'Private party', 'Date / relaxation', 'Event',
]

function Suggestions({ query, onPick }: { query: string; onPick: (v: string, href: string) => void }) {
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? citySuggestions.filter(
          (c) => c.city.toLowerCase().startsWith(q) || `${c.city}, ${c.state}`.toLowerCase().includes(q))
      : citySuggestions
    return list.slice(0, 5)
  }, [query])

  return (
    <div className="absolute inset-x-0 top-[calc(100%+8px)] z-40 overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-xl shadow-water-950/10">
      <Command shouldFilter={false} className="bg-white">
        <CommandList className="max-h-72">
          <CommandGroup heading={query.trim() ? 'Matching cities' : 'Popular right now'}>
            {results.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-ink-500">
                No cities match “{query}”. Try a ZIP code instead.
              </div>
            ) : (
              results.map((c) => (
                <CommandItem
                  key={c.href}
                  value={`${c.city} ${c.state}`}
                  onSelect={() => onPick(`${c.city}, ${c.state}`, c.href)}
                  className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl px-3"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sand-100 text-water-800">
                    <MapPin className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink-900">
                    {c.city}<span className="ml-1.5 font-normal text-ink-500">{c.state}</span>
                  </span>
                  {/* Count omitted entirely when unknown — never guessed. */}
                  {typeof c.poolCount === 'number' && (
                    <span className="shrink-0 text-xs text-ink-500">{c.poolCount} pools</span>
                  )}
                </CommandItem>
              ))
            )}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  )
}

export function SearchCard() {
  const [location, setLocation] = useState('')
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [occasion, setOccasion] = useState('')
  const [when, setWhen] = useState('')
  const [started, setStarted] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const onFirstInput = () => {
    if (!started) { beacon('homepage_search_started'); setStarted(true) }
  }

  const submit = async (explicitHref?: string) => {
    beacon('homepage_search_submitted')
    const dest = explicitHref
      ? { href: explicitHref, kind: 'pseo' as const }
      : await resolveDestination({ query: location, occasion, date: when })
    beacon(dest.kind === 'pseo' ? 'homepage_search_to_pseo' : 'homepage_search_to_sharetribe')
    window.location.assign(dest.href)
  }

  const closeSoon = () => window.setTimeout(() => {
    if (wrapRef.current && !wrapRef.current.contains(document.activeElement)) setOpen(false)
  }, 120)

  return (
    <form
      ref={wrapRef as any}
      onBlur={closeSoon}
      onSubmit={(e) => { e.preventDefault(); void submit() }}
      role="search"
      className="rounded-[28px] border border-sand-200 bg-white p-4 shadow-xl shadow-water-950/10 md:p-3"
    >
      {/* Mobile: stacked, location dominant */}
      <div className="md:hidden">
        <div className="relative">
          <label htmlFor="location-mobile" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">Where</label>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-water-700" aria-hidden="true" />
            <Input
              id="location-mobile" value={location}
              onChange={(e) => { setLocation(e.target.value); onFirstInput() }}
              onFocus={() => setOpen(true)}
              placeholder="Where do you want to swim?"
              aria-describedby="location-help-mobile"
              className="h-14 rounded-2xl border-sand-300 bg-sand-50 pl-12 text-base text-ink-900 placeholder:text-ink-500"
            />
          </div>
          <p id="location-help-mobile" className="mt-1.5 px-1 text-xs text-ink-500">City, ZIP, or address</p>
          {open && <Suggestions query={location} onPick={(v, href) => { setLocation(v); setOpen(false); void submit(href) }} />}
        </div>

        <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}
          className="mt-3 flex min-h-[44px] w-full items-center justify-between rounded-2xl px-1 text-sm font-medium text-ink-700">
          <span>Add plans and dates</span>
          <ChevronDown className={`h-4 w-4 text-ink-500 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>

        {expanded && (
          <div className="mt-1 grid grid-cols-1 gap-3">
            <div className="relative">
              <PartyPopper className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-water-700" aria-hidden="true" />
              <select aria-label="What are you planning?" value={occasion} onChange={(e) => setOccasion(e.target.value)}
                className="h-14 w-full appearance-none rounded-2xl border border-sand-300 bg-sand-50 pl-12 pr-10 text-base text-ink-900 focus:outline-none focus:ring-2 focus:ring-water-700/30">
                <option value="">What are you planning?</option>
                {occasionOptions.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" aria-hidden="true" />
            </div>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-water-700" aria-hidden="true" />
              <Input type="date" aria-label="When?" value={when} onChange={(e) => setWhen(e.target.value)}
                className="h-14 rounded-2xl border-sand-300 bg-sand-50 pl-12 text-base text-ink-900" />
            </div>
          </div>
        )}

        <Button type="submit" className="mt-3 h-14 w-full rounded-2xl bg-coral-500 text-base font-semibold text-white hover:bg-coral-600">
          <Search className="mr-2 h-5 w-5" aria-hidden="true" /> Find pools
        </Button>
      </div>

      {/* Desktop: single inline bar */}
      <div className="hidden md:block">
        <div className="flex items-stretch">
          <div className="relative flex-[1.4]">
            <div className="flex h-16 flex-col justify-center rounded-2xl px-5 transition-colors hover:bg-sand-50">
              <label htmlFor="location-desktop" className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Where</label>
              <input id="location-desktop" value={location}
                onChange={(e) => { setLocation(e.target.value); onFirstInput() }}
                onFocus={() => setOpen(true)} placeholder="Where do you want to swim?"
                className="w-full bg-transparent text-[15px] text-ink-900 placeholder:text-ink-500 focus:outline-none" />
            </div>
            {open && <Suggestions query={location} onPick={(v, href) => { setLocation(v); setOpen(false); void submit(href) }} />}
          </div>

          <div className="my-3 w-px shrink-0 bg-sand-200" aria-hidden="true" />

          <div className="flex-1">
            <div className="flex h-16 flex-col justify-center rounded-2xl px-5 transition-colors hover:bg-sand-50">
              <label htmlFor="occasion-desktop" className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Plans</label>
              <select id="occasion-desktop" value={occasion} onChange={(e) => setOccasion(e.target.value)}
                className="w-full cursor-pointer appearance-none bg-transparent text-[15px] text-ink-900 focus:outline-none">
                <option value="">What are you planning?</option>
                {occasionOptions.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>

          <div className="my-3 w-px shrink-0 bg-sand-200" aria-hidden="true" />

          <div className="flex-1">
            <div className="flex h-16 flex-col justify-center rounded-2xl px-5 transition-colors hover:bg-sand-50">
              <label htmlFor="when-desktop" className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">When</label>
              <input id="when-desktop" type="date" value={when} onChange={(e) => setWhen(e.target.value)}
                className="w-full bg-transparent text-[15px] text-ink-900 focus:outline-none" />
            </div>
          </div>

          <div className="flex items-center pl-3">
            <Button type="submit" className="h-14 rounded-2xl bg-coral-500 px-7 text-[15px] font-semibold text-white hover:bg-coral-600">
              <Search className="mr-2 h-5 w-5" aria-hidden="true" /> Find pools
            </Button>
          </div>
        </div>
        <p className="px-5 pb-1 text-xs text-ink-500">City, ZIP, or address</p>
      </div>
    </form>
  )
}
