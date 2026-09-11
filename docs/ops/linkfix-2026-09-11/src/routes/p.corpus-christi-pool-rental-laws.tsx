import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader, SiteFooter } from "@/components/site-layout";
import {
  buildMeta,
  breadcrumbJsonLd,
  ldJsonScript,
  SITE_URL,
  SITE_NAME,
} from "@/lib/seo";

const PATH = "/p/corpus-christi-pool-rental-laws";
const TITLE =
  "Corpus Christi Pool Rental Regulatory Guide: what Texas law actually says";
const DESCRIPTION =
  "What Texas law and Corpus Christi rules actually say about renting a private backyard pool by the hour. The public-pool vs. residential-pool definitions, the short-term rental ordinance, and the zoning question that is still open.";
const LAST_UPDATED = "2026-09-11";

const faqs = [
  {
    q: "Does accepting money automatically make a backyard pool a public pool in Texas?",
    a: "No. 25 TAC section 265.182(51) states that a public pool may be publicly or privately owned and that a fee for use may or may not be charged. Because the definition covers both fee and no-fee pools, the presence of a fee cannot by itself decide the classification. Whether a specific hourly-rental arrangement takes a pool outside the residential-pool definition in section 265.182(58) is a separate classification question that the regulations do not answer for every scenario.",
  },
  {
    q: "Does renting a backyard pool by the hour require commercial filtration equipment?",
    a: "Not automatically. Texas public-pool equipment and operational requirements in 25 TAC Chapter 265, Subchapter L apply within the public-pool framework. They describe what a public pool must do; they are not a test for deciding whether a pool is a public pool. Classification comes first.",
  },
  {
    q: "Is an hourly backyard pool rental a short-term rental under Corpus Christi rules?",
    a: "The City defines a short-term rental as a property that rents out all or a portion of a residential dwelling unit for a period of less than 30 days and not less than 12 hours. An hourly pool reservation, where the dwelling is not rented and the booking is under 12 hours, does not appear on its face to fit that definition. That does not eliminate every possible zoning or land-use requirement; Corpus Christi Development Services is the authority that classifies the use under the Unified Development Code.",
  },
];

type SourceItem = { title: string; url?: string; note: string };

const SOURCE_GROUPS: { group: string; items: SourceItem[] }[] = [
  {
    group: "Texas statute and rules",
    items: [
      {
        title:
          "Texas Health & Safety Code section 341.064 — Swimming Pools, Artificial Swimming Lagoons, and Bathhouses",
        url: "https://texas.public.law/statutes/tex._health_and_safety_code_section_341.064",
        note: "Sanitation, disinfection and construction duties for public swimming pools. Subsection (n) permits counties and municipalities to require permits and conduct inspections.",
      },
      {
        title: "Texas DSHS — Laws and Rules, Public Swimming Pools and Spas",
        url: "https://www.dshs.texas.gov/public-swimming-pools-spas/laws-rules-public-swimming-pools-spas",
        note: "The agency index page linking the statutes and 25 TAC Chapter 265, Subchapter L.",
      },
      {
        title: "25 TAC Chapter 265, Subchapter L — full text (DSHS PDF)",
        url: "https://www.dshs.texas.gov/sites/default/files/poolspa/pdf/25%20TAC-P1-CH%20265-SubCh%20L%20-%20050324.pdf",
        note: "The whole subchapter in one official document. Every quotation on this page is taken from it. The individual sections are listed below with their exact titles, because these are frequently cited with the wrong title.",
      },
      {
        title: "25 TAC section 265.181 — General Provisions",
        url: "https://www.law.cornell.edu/regulations/texas/25-Tex-Admin-Code-SS-265-181",
        note: "Scope and purpose. Adopts the 2021 International Swimming Pool and Spa Code by reference for commercial pools, and expressly does not adopt its residential-pool chapters (7 through 10).",
      },
      {
        title: "25 TAC section 265.182 — Definitions",
        url: "https://www.law.cornell.edu/regulations/texas/25-Tex-Admin-Code-SS-265-182",
        note: "The section this whole question turns on: (51) Public pool, including the Class A, B and C classes, and (58) Residential pool or spa.",
      },
      {
        title:
          "25 TAC section 265.189 — Disinfectant Equipment and Chemical Feeders",
        url: "https://www.law.cornell.edu/regulations/texas/25-Tex-Admin-Code-SS-265-189",
        note: "Disinfection and chemical feeder requirements for public pools and spas.",
      },
      {
        title: "25 TAC section 265.190 — Safety Features for Pools and Spas",
        url: "https://www.law.cornell.edu/regulations/texas/25-Tex-Admin-Code-SS-265-190",
        note: "Safety equipment and features required at public pools and spas.",
      },
      {
        title:
          "25 TAC section 265.191 — Lifeguard Personnel Requirements and Standards at Pools",
        url: "https://www.law.cornell.edu/regulations/texas/25-Tex-Admin-Code-SS-265-191",
        note: "Lifeguard staffing and training. Note the actual subject: this section is often cited as if it concerned filtration or equipment. It does not.",
      },
      {
        title: "25 TAC section 265.192 — Pool Yard and Spa Yard Enclosures",
        url: "https://www.law.cornell.edu/regulations/texas/25-Tex-Admin-Code-SS-265-192",
        note: "Enclosure, fencing and gate standards for public pool yards.",
      },
      {
        title: "25 TAC section 265.193 — Water Quality at Pools and Spas",
        url: "https://www.law.cornell.edu/regulations/texas/25-Tex-Admin-Code-SS-265-193",
        note: "Water chemistry and clarity standards. This is the water-quality section, not 265.194.",
      },
      {
        title:
          "25 TAC section 265.194 — Operation and Management of Pools and Spas",
        url: "https://www.law.cornell.edu/regulations/texas/25-Tex-Admin-Code-SS-265-194",
        note: "Day-to-day operation, circulation system upkeep, records, and the operator-certification requirement quoted above, which applies to Class A, B and C pools.",
      },
      {
        title:
          "Texas Health & Safety Code section 757.002 — Application (pool yard enclosures)",
        url: "https://texas.public.law/statutes/tex._health_and_safety_code_section_757.002",
        note: "Limits Chapter 757 to pools owned or maintained by the owner of a multiunit rental complex or a property owners association.",
      },
    ],
  },
  {
    group: "City of Corpus Christi",
    items: [
      {
        title: "City of Corpus Christi — Short Term Rentals (STR)",
        url: "https://www.corpuschristitx.gov/department-directory/development-services/short-term-rentals-str/",
        note: "Source of the STR definition quoted above, the Type 1 and Type 2 categories, the 15% block-face cap, the Padre/Mustang Island exception, the $250 annual permit, and the registration contacts.",
      },
      {
        title: "City of Corpus Christi — Unified Development Code (UDC)",
        url: "https://www.corpuschristitx.gov/department-directory/development-services/unified-development-code-udc/",
        note: "Department page for the UDC, with the link to the full code text.",
      },
      {
        title: "Corpus Christi Unified Development Code — full text",
        url: "https://online.encodeplus.com/regs/corpuschristi-tx/doc-viewer.aspx",
        note: "The searchable code viewer hosted for the City.",
      },
      {
        title: "City of Corpus Christi — Construction Codes and Ordinances",
        url: "https://www.corpuschristitx.gov/department-directory/development-services/construction-codes-and-ordinances/",
        note: "Adoption of the 2021 International Swimming Pool and Spa Code with local amendments, effective 1 August 2023.",
      },
      {
        title:
          "Corpus Christi–Nueces County Public Health District — Food and Environmental Inspections",
        url: "https://www.corpuschristitx.gov/department-directory/health-district/food-and-environmental-inspections/",
        note: "Environmental & Consumer Health Services, recreational water facility inspections and the pool permit application.",
      },
      {
        title:
          "City of Corpus Christi — August 2026 short-term rental amendments",
        note: "Reported action of the City Council on 25 August 2026 (pause on new Type 1 permit applications through 17 November 2026, and a homestead-exemption test for Type 1). No City page or posted ordinance confirming this action could be located as of 11 September 2026, so no URL is given. Confirm with Development Services.",
      },
    ],
  },
  {
    group: "Insurance and press",
    items: [
      {
        title: "Texas Department of Insurance — Home sharing and insurance",
        url: "https://www.tdi.texas.gov/tips/home-sharing.html",
        note: "TDI consumer guidance on home sharing. Note: no TDI guidance specific to renting a swimming pool without renting the dwelling was located in this review. Treat coverage questions as questions for your own insurer.",
      },
      {
        title:
          "KRIS 6 — “Looking to cool off? Swimply pool rentals grow in Corpus Christi”",
        url: "https://www.kristv.com/news/local-news/in-your-neighborhood/corpus-christi/looking-to-cool-off-swimply-pool-rentals-grow-in-corpus-christi",
        note: "Reporting on Corpus Christi homeowner Nick Thompson. The article carries no visible publication date and does not address permits or zoning.",
      },
    ],
  },
];

function Cite({
  source,
  children,
  note,
}: {
  source: string;
  children: React.ReactNode;
  note?: string;
}) {
  return (
    <div className="mt-5 rounded-r border border-l-4 border-slate-200 border-l-blue-900 bg-blue-50/60 p-4">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-blue-900">
        {source}
      </p>
      <blockquote className="mt-2 font-serif text-[17px] leading-relaxed text-slate-900">
        {children}
      </blockquote>
      {note ? (
        <p className="mt-2 text-sm italic text-slate-600">{note}</p>
      ) : null}
    </div>
  );
}

function Callout({
  kind,
  label,
  children,
}: {
  kind: "established" | "unresolved" | "flag";
  label: string;
  children: React.ReactNode;
}) {
  const style =
    kind === "established"
      ? "border-emerald-700 bg-emerald-50/70"
      : kind === "unresolved"
        ? "border-amber-700 bg-amber-50/70"
        : "border-dashed border-slate-300 bg-white";
  const labelStyle =
    kind === "established"
      ? "text-emerald-800"
      : kind === "unresolved"
        ? "text-amber-800"
        : "text-slate-500";
  return (
    <div className={`mt-5 rounded border p-4 ${style}`}>
      <p
        className={`font-mono text-[11px] font-semibold uppercase tracking-wider ${labelStyle}`}
      >
        {label}
      </p>
      <div className="mt-2 space-y-2 text-[16px] leading-relaxed text-slate-900">
        {children}
      </div>
    </div>
  );
}

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="mt-12 scroll-mt-6 border-t-2 border-blue-900 pt-3 text-2xl font-bold leading-tight text-slate-900 md:text-[27px]"
    >
      {children}
    </h2>
  );
}

const TOC = [
  ["short-answer", "The short answer"],
  ["definitions", "Public pool vs. residential pool"],
  ["money", "Does accepting money make it a public pool?"],
  ["filtration", "Does renting require commercial filtration?"],
  ["str", "Corpus Christi short-term rental rules"],
  ["zoning", "The question that still needs an answer"],
  ["changes", "2026 Corpus Christi changes"],
  ["insurance", "Insurance is a separate issue"],
  ["kris", "Why this question is coming up"],
  ["next", "What a homeowner should do next"],
  ["related", "Related guides"],
  ["sources", "Primary sources"],
  ["disclaimer", "Disclaimer"],
];

const LETTER =
  "I own a residential property in Corpus Christi and live at the property. I am considering allowing members of the public to reserve and use only my private backyard swimming pool for short hourly periods. I would not be renting or making the dwelling available to guests. How does the City classify this use under the Unified Development Code, and does the activity require a zoning/use approval, permit, or other City authorization?";

export const Route = createFileRoute("/p/corpus-christi-pool-rental-laws")({
  head: () => {
    const meta = buildMeta({
      title: TITLE,
      description: DESCRIPTION,
      path: PATH,
      type: "article",
    });
    return {
      meta: meta.meta,
      links: meta.links,
      scripts: [
        ldJsonScript({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: "Corpus Christi Pool Rental Regulatory Guide",
          description: DESCRIPTION,
          datePublished: LAST_UPDATED,
          dateModified: LAST_UPDATED,
          publisher: {
            "@type": "Organization",
            name: SITE_NAME,
            url: SITE_URL,
            logo: {
              "@type": "ImageObject",
              url: `${SITE_URL}/icon-512.png`,
            },
          },
          mainEntityOfPage: `${SITE_URL}${PATH}`,
        }),
        ldJsonScript({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: {
              "@type": "Answer",
              text: f.a,
              speakable: {
                "@type": "SpeakableSpecification",
                cssSelector: [".faq-answer"],
              },
            },
          })),
        }),
        ldJsonScript(
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Corpus Christi Pool Rental Regulatory Guide", path: PATH },
          ]),
        ),
      ],
    };
  },
  component: CorpusChristiPoolRentalLawsPage,
});

function CorpusChristiPoolRentalLawsPage() {
  const [copied, setCopied] = React.useState(false);

  const copyLetter = React.useCallback(() => {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      navigator.clipboard.writeText
    ) {
      navigator.clipboard.writeText(LETTER).then(
        () => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        },
        () => setCopied(false),
      );
    }
  }, []);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 text-slate-900 md:py-10">
        <nav className="mb-4 text-xs text-slate-500">
          <Link to="/" className="hover:underline">
            Home
          </Link>
          <span className="mx-2">/</span>
          <span>Corpus Christi pool rental laws</span>
        </nav>

        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Regulatory guide · Corpus Christi, Texas
        </p>
        <h1 className="mt-3 text-[30px] font-bold leading-tight tracking-tight md:text-[42px]">
          Corpus Christi Pool Rental Regulatory Guide
        </h1>
        <p className="mt-3 text-lg leading-relaxed text-slate-600">
          What Texas law and Corpus Christi rules actually say about renting a
          private backyard pool by the hour.
        </p>
        <p className="mt-4 border-t border-slate-200 pt-3 font-mono text-xs text-slate-500">
          Reviewed {LAST_UPDATED} · Informational summary — not legal advice
        </p>

        {/* REGULATORY STATUS */}
        <div className="mt-7 overflow-hidden rounded border border-slate-300 shadow-sm">
          <div className="bg-blue-900 px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-white">
            Regulatory status
          </div>
          <div className="grid gap-px bg-slate-200 sm:grid-cols-2">
            <div className="bg-white p-4">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
                What we can establish
              </p>
              <p className="mt-2 leading-relaxed">
                Accepting payment does not, by itself, establish that a private
                pool is a regulated public pool.
              </p>
            </div>
            <div className="bg-white p-4">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-amber-800">
                What remains unresolved
              </p>
              <p className="mt-2 leading-relaxed">
                Whether a particular hourly pool-rental operation qualifies as a
                residential pool under Texas law, and how Corpus Christi
                classifies the use under its Unified Development Code.
              </p>
            </div>
          </div>
        </div>

        {/* CONTENTS */}
        <nav
          aria-label="On this page"
          className="mt-6 rounded border border-slate-200 bg-white p-4"
        >
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            On this page
          </p>
          <ol className="mt-3 grid gap-2 sm:grid-cols-2 sm:gap-x-6">
            {TOC.map(([id, label], i) => (
              <li key={id} className="flex gap-2.5 text-[15px] leading-snug">
                <span className="pt-0.5 font-mono text-xs tabular-nums text-slate-400">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <a href={`#${id}`} className="text-slate-900 hover:underline">
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* 1. SHORT ANSWER */}
        <SectionHeading id="short-answer">The short answer</SectionHeading>
        <p className="mt-4 leading-relaxed">
          There is no evidence in the Texas regulations and Corpus Christi
          materials reviewed here that simply accepting payment for hourly use
          automatically converts a private backyard pool into an illegal
          commercial pool requiring commercial filtration equipment or automatic
          rezoning.
        </p>
        <p className="mt-3 leading-relaxed">
          That is not the same as saying the activity is approved. The exact
          classification of a particular operation — under Texas pool
          regulations and under Corpus Christi land-use rules — should be
          confirmed with the appropriate government authority. This page
          explains where the lines actually are, quotes the rules that draw
          them, and shows exactly which question is still open and who answers
          it.
        </p>
        <Callout kind="flag" label="How to read this page">
          <p>
            Green “Established” boxes mark things the text of the law or an
            official City page actually says. Amber “Unresolved” boxes mark
            questions the reviewed materials do not answer. Nothing here is a
            determination by the City of Corpus Christi or the State of Texas.
          </p>
        </Callout>

        {/* 2. DEFINITIONS */}
        <SectionHeading id="definitions">
          Public pool vs. residential pool
        </SectionHeading>
        <p className="mt-4 leading-relaxed">
          Texas regulates <em>public</em> pools. The rules live in the Texas
          Administrative Code, Title 25, Chapter 265, Subchapter L, and they are
          written to implement Texas Health &amp; Safety Code section 341.064.
          Subchapter L defines both terms, and the two definitions are where
          almost every argument about pool rentals actually lives.
        </p>

        <Cite source="25 TAC 265.182(51) — “Public pool”">
          “For purposes of the rules in this subchapter related to safety,
          operation and management, signage and enclosures, pools are classified
          and referred to as follows: any man-made permanently installed or
          non-portable structure, basin, chamber, or tank containing an
          artificial body of water that is maintained or used expressly for
          public recreation, swimming, diving, aquatic sports, or other aquatic
          activity. Public pools include but are not limited to activity pools,
          catch pools, lazy or leisure river pools, wave action pools, vortex
          pools, therapy pools, and wading pools.{" "}
          <strong className="font-semibold">
            A public pool may be publicly or privately owned and may be operated
            by an owner, lessee, operator, licensee, or concessionaire. A fee
            for use may or not be charged. The term does not include a
            residential pool
          </strong>
          , artificial swimming lagoon, floatation system or chamber, or a body
          of water that continuously recirculates water from a spring.”
        </Cite>

        <Cite source="25 TAC 265.182(58) — “Residential pool or spa”">
          “A pool or spa that is located on private property under the control
          of the property owner or the owner’s tenant and that is intended for
          use by not more than two resident families and their guests. It
          includes a pool or a spa serving only a single-family home or duplex.”
        </Cite>

        <p className="mt-5 leading-relaxed">
          Two things follow directly from the text. First, private ownership
          does not make a pool residential — the public-pool definition
          expressly covers privately owned pools. Second, a residential pool is
          not a public pool; it is carved out of the definition by name.
        </p>

        <div className="mt-5 overflow-x-auto rounded border border-slate-200">
          <table className="w-full min-w-[520px] border-collapse text-[15px]">
            <thead>
              <tr className="bg-slate-50">
                <th className="border-b border-slate-200 px-3 py-2.5 text-left font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Test
                </th>
                <th className="border-b border-slate-200 px-3 py-2.5 text-left font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Public pool
                </th>
                <th className="border-b border-slate-200 px-3 py-2.5 text-left font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Residential pool
                </th>
              </tr>
            </thead>
            <tbody className="align-top">
              <tr>
                <th className="border-b border-slate-200 px-3 py-2.5 text-left font-semibold">
                  Who owns it
                </th>
                <td className="border-b border-slate-200 px-3 py-2.5">
                  Public or private owner
                </td>
                <td className="border-b border-slate-200 px-3 py-2.5">
                  Private property, controlled by owner or tenant
                </td>
              </tr>
              <tr>
                <th className="border-b border-slate-200 px-3 py-2.5 text-left font-semibold">
                  Is a fee charged
                </th>
                <td className="border-b border-slate-200 px-3 py-2.5">
                  “A fee for use may or not be charged”
                </td>
                <td className="border-b border-slate-200 px-3 py-2.5">
                  Not addressed by the definition
                </td>
              </tr>
              <tr>
                <th className="border-b border-slate-200 px-3 py-2.5 text-left font-semibold">
                  Who it is for
                </th>
                <td className="border-b border-slate-200 px-3 py-2.5">
                  Maintained or used expressly for public recreation
                </td>
                <td className="border-b border-slate-200 px-3 py-2.5">
                  Intended for use by not more than two resident families and
                  their guests
                </td>
              </tr>
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold">
                  Relationship
                </th>
                <td className="px-3 py-2.5" colSpan={2}>
                  “The term [public pool] does not include a residential pool.”
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mt-5 leading-relaxed">
          Subchapter L further sorts public pools into Class A, B and C. Class C
          is the category people usually have in mind when they say
          “commercial” — and it is defined by the setting, not by the fact of
          payment:
        </p>

        <Cite
          source="25 TAC 265.182(51)(C) — “Class C pool”"
          note="A single-family backyard pool is not named in any of those three categories."
        >
          “Any pool that is not a Class A or B pool that is limited to
          occupants, members, or students and their guests, but not to the
          general public. It is a pool operated for and in conjunction with: (i)
          lodging, such as hotels, motels, apartments, condominiums, RV parks,
          or mobile home parks; (ii) youth camps, property owner associations,
          private organizations, or clubs; or (iii) schools, colleges, or
          universities while operated for academic or continuing education
          classes.”
        </Cite>

        {/* 3. MONEY */}
        <SectionHeading id="money">
          Does accepting money automatically make it a public pool?
        </SectionHeading>
        <Callout kind="established" label="Established">
          <p className="faq-answer">
            No. The public-pool definition states that a public pool “may be
            publicly or privately owned” and that “a fee for use may or not be
            charged.” Because the definition covers both fee and no-fee pools,
            the presence of a fee cannot be the thing that decides which side of
            the line a pool falls on.
          </p>
        </Callout>
        <p className="mt-5 leading-relaxed">
          Put plainly: “money changed hands, therefore it is a commercial pool”
          is not a test that appears anywhere in the regulation. A fee is
          charged at many public pools and at no public pools alike; the
          definition is indifferent to it. The same rule cuts the other way —
          charging nothing does not automatically make a pool residential
          either.
        </p>
        <Callout kind="unresolved" label="Unresolved">
          <p>
            What the regulation does turn on is use: whether the pool is
            “maintained or used expressly for public recreation,” and whether it
            is still “intended for use by not more than two resident families
            and their guests.” Whether a specific hourly-rental arrangement
            takes a particular pool outside the residential-pool definition is a
            classification question. The regulations reviewed here do not answer
            it for every pool-rental scenario, and no Texas determination
            covering pool-rental platforms generally was identified in this
            review.
          </p>
        </Callout>

        {/* 4. FILTRATION */}
        <SectionHeading id="filtration">
          Does renting the pool automatically require commercial filtration
          equipment?
        </SectionHeading>
        <p className="mt-4 text-lg font-semibold">Not automatically.</p>
        <p className="mt-3 leading-relaxed faq-answer">
          Texas public-pool rules do contain detailed operational and equipment
          requirements. Subchapter L covers, among other things, disinfection
          and chemical feeders (265.189), pumps, motors and the circulation
          system (265.185 and 265.194), water supply (265.187), electrical
          requirements (265.186), water quality (265.193), safety features
          (265.190), lifeguard requirements (265.191), pool yard enclosures
          (265.192), and certified operators and day-to-day operation and
          management (265.194). Texas Health &amp; Safety Code section 341.064
          sets sanitation duties — including a minimum free residual chlorine
          level — for public swimming pools.
        </p>
        <p className="mt-3 leading-relaxed">
          But every one of those requirements sits <em>inside</em> the
          public-pool framework. They describe what a public pool must do. They
          are not a test for deciding whether something is a public pool in the
          first place. The operator-certification rule shows this plainly,
          because it names exactly which pools it reaches:
        </p>
        <Cite
          source="25 TAC 265.194(b) — Required operator certification"
          note="Class A, B and C are the three classes of public pool. The requirement attaches to the classification — it does not create one."
        >
          “All Class A, Class B, and Class C pools and spas must be maintained
          under the supervision and direction of a properly trained and
          certified operator.”
        </Cite>
        <Callout kind="established" label="Established — the order of the questions">
          <p>
            Classification comes first. You cannot logically start with
            commercial-pool equipment requirements and use those requirements
            themselves to prove that the pool is a public pool. If the pool is a
            residential pool, Subchapter L’s public-pool equipment standards are
            not the applicable standard; if it is a public pool, they are.
          </p>
        </Callout>
        <p className="mt-5 leading-relaxed">
          One requirement people often assume applies is the pool-yard enclosure
          law in Health &amp; Safety Code Chapter 757. By its own terms that
          chapter applies only to “a pool owned, controlled, or maintained by
          the owner of a multiunit rental complex or by a property owners
          association” and to doors and windows of rental dwellings opening into
          such a pool yard. It does not reach a pool at a single-family home.
          Separately, ordinary city building, barrier and electrical codes still
          apply to your pool as they always have — Corpus Christi has adopted
          the 2021 International Swimming Pool and Spa Code with local
          amendments.
        </p>
        <p className="mt-3 leading-relaxed">
          Local permitting is also possible, but again only for public pools:
          section 341.064(n) allows a county or municipality to require permits,
          conduct inspections and charge reasonable fees for facilities within
          its jurisdiction. In Corpus Christi that work is done by the Corpus
          Christi–Nueces County Public Health District, which inspects
          recreational water facilities and issues pool permits. They are the
          right people to ask about the pool-classification half of this
          question.
        </p>

        {/* 5. STR */}
        <SectionHeading id="str">
          Is an hourly backyard pool rental automatically a Corpus Christi
          short-term rental?
        </SectionHeading>
        <p className="mt-4 leading-relaxed">
          Corpus Christi registers and regulates short-term rentals. The City’s
          own definition is short and specific:
        </p>
        <Cite source="City of Corpus Christi — Short Term Rentals (STR) page">
          “A short-term rental is a property that rents out all or a portion of
          a residential dwelling unit for a period of less than 30 days and not
          less than 12 hours.”
        </Cite>
        <p className="mt-5 leading-relaxed">
          Two elements of that definition matter here. It concerns a{" "}
          <strong className="font-semibold">residential dwelling unit</strong>,
          and it carries a{" "}
          <strong className="font-semibold">
            minimum rental period of 12 hours
          </strong>
          .
        </p>
        <Callout kind="established" label="Established — what the definition says">
          <p className="faq-answer">
            An hourly reservation for use of a backyard pool, where the
            residential dwelling itself is not being rented and the booking is
            well under 12 hours, does not appear on its face to fit that STR
            definition.
          </p>
        </Callout>
        <Callout kind="unresolved" label="Unresolved — what that does not settle">
          <p>
            Not fitting the STR definition does not conclusively eliminate every
            possible zoning or land-use requirement. Corpus Christi could
            evaluate the activity under its broader Unified Development Code
            use-classification rules instead, and the STR ordinance is not the
            only place the City regulates what happens on residential property.
            Only the City can say how it classifies the use.
          </p>
        </Callout>
        <p className="mt-5 leading-relaxed">
          For reference, the City’s current STR framework covers registration
          through its MUNIRevs portal, an annual permit (currently $250, renewed
          each January), Type 1 owner-occupied and Type 2 non-owner-occupied
          categories, a 15% block-face cap on Type 2, and an exception for
          single-family zones in the Padre/Mustang Island Area Development Plan.
          All of that is about renting dwellings.
        </p>

        {/* 6. ZONING */}
        <SectionHeading id="zoning">
          The question that still needs an official answer
        </SectionHeading>
        <p className="mt-4 leading-relaxed">
          This is the honest centre of the page.
        </p>
        <Callout kind="unresolved" label="Unresolved">
          <p>
            There is no identified Corpus Christi provision in the research
            reviewed that expressly says “renting a private backyard swimming
            pool by the hour is illegal.” There is equally no basis to promise
            “you definitely do not need zoning approval.” This remains a
            classification question, and the appropriate authority to resolve it
            is Corpus Christi Development Services.
          </p>
        </Callout>
        <p className="mt-5 leading-relaxed">
          The useful move is not to argue about it online. It is to put the
          question to the City in the form the City can answer. The question is:
        </p>
        <Cite source="The question for Development Services">
          How does the City classify an owner-occupied or residential property
          where the homeowner rents only the private swimming pool by the hour,
          without renting the dwelling?
        </Cite>
        <p className="mt-5 leading-relaxed">
          Corpus Christi has mechanisms for formal land-use interpretation. The
          City’s Development Services Department administers the Unified
          Development Code and maintains written interpretations of it, and
          where appropriate a property owner can seek a UDC written
          interpretation or a non-conforming use determination rather than
          relying on an informal answer. Ask what the correct application is for
          your situation when you call — the staff who administer the UDC will
          know which one fits.
        </p>

        {/* 7. 2026 */}
        <SectionHeading id="changes">
          Corpus Christi STR rules — 2026
        </SectionHeading>
        <p className="mt-4 leading-relaxed">
          Corpus Christi’s short-term rental framework has been amended
          repeatedly, including during 2026. Reported changes in August 2026
          include a temporary pause on accepting new{" "}
          <strong className="font-semibold">Type 1</strong> (owner-occupied) STR
          permit applications through{" "}
          <strong className="font-semibold">November 17, 2026</strong>, and a
          tightening of what qualifies a property as Type 1 — tying it to a
          homestead exemption on the property. Type 2 (non-owner-occupied)
          permits and the 15% block-face cap were reported as unaffected.
        </p>
        <Callout
          kind="flag"
          label="Sourcing note — read this before relying on the paragraph above"
        >
          <p>
            As of 11 September 2026, the City’s own Short Term Rentals page does
            not describe a moratorium, and we were not able to locate a City of
            Corpus Christi web page or posted ordinance confirming the August
            2026 action. The description above comes from secondary reporting.
            Confirm the current status directly with Development Services before
            acting on it.
          </p>
        </Callout>
        <Callout
          kind="established"
          label="Established — what this section is and is not about"
        >
          <p>
            These changes concern the City’s short-term rental framework and the
            rental of residential dwelling units. Nothing in them states that
            they apply to hourly swimming-pool rentals, and this page does not
            imply that the STR moratorium automatically applies to hourly pool
            rentals.
          </p>
        </Callout>

        {/* 8. INSURANCE */}
        <SectionHeading id="insurance">
          Insurance is a separate issue
        </SectionHeading>
        <p className="mt-4 leading-relaxed">
          Insurance and legality are two different questions, answered by two
          different people. It is worth keeping them apart, because they get
          mixed together constantly in neighbourhood conversations.
        </p>
        <p className="mt-3 leading-relaxed">
          A coverage limit, a policy exclusion, or a requirement that you buy
          additional coverage is a matter between you and your insurer. It is
          not a determination by the City of Corpus Christi or the State of
          Texas that the activity is prohibited. The reverse is also true:
          nothing about how the City classifies your use tells you what your
          policy covers.
        </p>
        <p className="mt-3 leading-relaxed">
          Whether your specific homeowners policy responds to paying guests
          using your pool is a question only your own insurer or agent can
          answer for your policy. Ask them in writing and keep the answer. The
          Texas Department of Insurance operates a consumer help line and
          publishes consumer guidance, including material on home sharing, if
          you want an independent place to start.
        </p>
        <Callout kind="flag" label="Pool Rental Near Me">
          <p>
            Pool Rental Near Me does not give insurance advice and makes no
            representation on this page about what any policy — yours, ours, or
            a platform’s — does or does not cover. If you have an insurance
            question for us, contact us directly and it will be answered by a
            person, not by a web page.
          </p>
        </Callout>

        {/* 9. KRIS */}
        <SectionHeading id="kris">Why this question is coming up</SectionHeading>
        <p className="mt-4 leading-relaxed">
          KRIS 6 (KRIS-TV) has reported on a Corpus Christi homeowner, Nick
          Thompson, who had been renting his backyard pool through Swimply for
          approximately three years, in a story headlined “Looking to cool off?
          Swimply pool rentals grow in Corpus Christi.” The article does not
          discuss permits, zoning or regulation, and the page carries no visible
          publication date.
        </p>
        <Callout kind="flag" label="What that report is worth as evidence">
          <p>
            This is evidence that the activity exists in Corpus Christi and has
            for some time. It is{" "}
            <strong className="font-semibold">not</strong> proof that every such
            operation is legally compliant, and it is not a statement by the
            City that the use is permitted. A news story is not a determination.
          </p>
        </Callout>
        <p className="mt-5 leading-relaxed">
          The same applies in the other direction to a comment on social media,
          a neighbour’s opinion, or a strongly worded post in a local group.
          None of those are determinations either. That cuts both ways, and it
          is the reason this page exists.
        </p>

        {/* 10. NEXT */}
        <SectionHeading id="next">
          What a homeowner should do next
        </SectionHeading>
        <ol className="mt-5 space-y-3">
          {[
            [
              "Do not treat a Facebook comment as a legal determination.",
              "Neither an accusation nor a reassurance in a comment thread has any legal weight. Write down the specific claim being made so you can ask the right office about it.",
            ],
            [
              "Establish how your pool is being treated under the Texas rules",
              "— residential pool or regulated public pool. Pool classification and inspection locally sits with the Corpus Christi–Nueces County Public Health District (Environmental & Consumer Health Services), which handles recreational water facilities and pool permits.",
            ],
            [
              "Ask Corpus Christi Development Services how the specific use is classified under the UDC.",
              "Use the wording below so the question lands as a land-use question, not a general enquiry.",
            ],
            [
              "If necessary, request the appropriate written interpretation or use determination.",
              "Ask Development Services which application applies to your situation, and get the answer in writing rather than over the phone.",
            ],
            [
              "Separately verify your insurance.",
              "Ask your own agent or insurer, in writing, whether your policy responds to paying guests using your pool. Do this regardless of how the classification question comes out.",
            ],
          ].map(([head, body], i) => (
            <li
              key={i}
              className="rounded border border-slate-200 bg-white p-4 pl-4"
            >
              <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                Step {i + 1}
              </p>
              <p className="mt-1.5 leading-relaxed">
                <strong className="font-semibold">{head}</strong> {body}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-6 overflow-hidden rounded border border-slate-300">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Suggested wording to send Development Services
            </span>
            <button
              type="button"
              id="copy-letter"
              onClick={copyLetter}
              className="rounded border border-slate-300 px-2.5 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-50"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="p-4 font-serif text-[16.5px] leading-relaxed">
            “{LETTER}”
          </p>
        </div>

        <h3 className="mt-8 text-lg font-semibold">Who to contact</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded border border-slate-200 bg-white p-4">
            <p className="font-semibold">Corpus Christi Development Services</p>
            <p className="mt-1 text-sm text-slate-600">
              Zoning and Unified Development Code classification
            </p>
            <p className="mt-2 font-mono text-[13.5px]">(361) 826-3240</p>
            <a
              href="https://www.corpuschristitx.gov/department-directory/development-services/"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block font-mono text-[13px] text-blue-800 hover:underline"
            >
              corpuschristitx.gov · Development Services
            </a>
          </div>
          <div className="rounded border border-slate-200 bg-white p-4">
            <p className="font-semibold">
              Corpus Christi–Nueces County Public Health District
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Environmental &amp; Consumer Health Services — pool permits and
              inspections
            </p>
            <p className="mt-2 font-mono text-[13.5px]">(361) 826-7222</p>
            <p className="font-mono text-[13.5px]">
              1702 Horne Rd., Corpus Christi, TX 78416
            </p>
          </div>
        </div>

        {/* 11. SOURCES */}
        <SectionHeading id="sources">Primary sources</SectionHeading>
        <p className="mt-4 leading-relaxed">
          Every link opens in a new tab. Where a source could not be confidently
          linked, the citation is given without a URL rather than inventing one.
        </p>
        {SOURCE_GROUPS.map((g) => (
          <div key={g.group}>
            <p className="mt-7 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              {g.group}
            </p>
            <div className="mt-2 border-t border-slate-200">
              {g.items.map((s) => (
                <div
                  key={s.title}
                  className="border-b border-slate-200 py-3.5"
                >
                  {s.url ? (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold leading-snug text-blue-800 hover:underline"
                    >
                      {s.title}
                    </a>
                  ) : (
                    <span className="font-semibold leading-snug">
                      {s.title}
                    </span>
                  )}
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    {s.note}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* 11b. RELATED ADVOCACY GUIDES */}
        <SectionHeading id="related">Related guides</SectionHeading>
        <p className="mt-4 leading-relaxed">
          This page covers the Corpus Christi dispute specifically. For the law
          and strategy that apply across the state, and for the conversation with
          an HOA, start here:
        </p>
        <ul className="mt-4 space-y-3">
          <li className="rounded border border-slate-200 bg-white p-4">
            <a
              href="/p/host-advocacy-texas"
              className="font-semibold text-blue-800 hover:underline"
            >
              Texas pool host advocacy guide
            </a>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Statewide rules and strategy: how Texas treats pool hosting across
              its cities and counties, and what applies to you wherever you are in
              the state.
            </p>
          </li>
          <li className="rounded border border-slate-200 bg-white p-4">
            <a
              href="/p/hoa-pool-rental-defense-kit"
              className="font-semibold text-blue-800 hover:underline"
            >
              HOA pool rental defense kit
            </a>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              If the pushback is coming from a homeowners association or a
              neighbour rather than the City: templates and citations for that
              conversation.
            </p>
          </li>
          <li className="rounded border border-slate-200 bg-white p-4">
            <a
              href="/p/host-advocacy"
              className="font-semibold text-blue-800 hover:underline"
            >
              Host Advocacy Center
            </a>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Guides for all 50 states, plus the local guides for cities where
              hosting has been questioned.
            </p>
          </li>
        </ul>

        {/* 12. DISCLAIMER */}
        <SectionHeading id="disclaimer">Disclaimer</SectionHeading>
        <p className="mt-4 text-[15px] leading-relaxed text-slate-600">
          This page is an informational summary of publicly available laws,
          regulations, and City materials. It is not legal advice and does not
          constitute an official determination by the City of Corpus Christi,
          the State of Texas, or any regulatory agency. Property owners should
          obtain an official determination from the appropriate authority for
          their specific property and operation.
        </p>
        <p className="mt-4 text-[15px] leading-relaxed text-slate-600">
          Published by {SITE_NAME} as a reference for Corpus Christi homeowners.
          If you find an error in a citation on this page, tell us and we will
          correct it.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
