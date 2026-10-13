import { ArrowRightIcon } from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'
import { Link } from 'react-router'
import { WideImage } from '@/components/brand/ProductImage'
import { Eyebrow } from '@/components/brand/bits'
import { Button } from '@/components/ui/button'

const ease = [0.16, 1, 0.3, 1] as const

export function Hero({ compounds }: { compounds: number | null }) {
  const reduce = useReducedMotion()
  const rise = (delay: number) =>
    reduce ? {} : { initial: { opacity: 0, y: 22 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, delay, ease } }

  return (
    <section className="relative isolate overflow-hidden border-b">
      {/* Photograph bleeds off the right edge; a gradient melts it into the page on wide screens. */}
      <motion.div
        className="relative h-[46vh] min-h-[300px] lg:absolute lg:inset-y-0 lg:right-0 lg:h-auto lg:w-[62%]"
        initial={reduce ? false : { opacity: 0, scale: 1.04 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.4, ease }}
      >
        <WideImage slug="nad-plus" alt="KYVO NAD+ research vial with a brushed gold cap on black marble" priority className="size-full" imgClassName="object-[50%_45%]" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/10 to-transparent lg:bg-gradient-to-r lg:from-background lg:via-background/40 lg:to-transparent" />
      </motion.div>

      <div className="container-x relative">
        <div className="flex max-w-[760px] flex-col justify-center pt-2 pb-14 lg:min-h-[calc(100dvh-6.25rem)] lg:max-h-[880px] lg:py-24">
          <motion.div {...rise(0.1)}>
            <Eyebrow>Research use only</Eyebrow>
          </motion.div>
          <motion.h1 {...rise(0.18)} className="display mt-4 text-[clamp(3rem,9.5vw,5.75rem)]">
            <span className="lg:block lg:whitespace-nowrap">Research peptides,</span>{" "}
            <span className="gold-text lg:block lg:whitespace-nowrap">tested lot by lot.</span>
          </motion.h1>
          <motion.p {...rise(0.28)} className="mt-6 max-w-[46ch] text-base text-muted-foreground sm:text-lg">
            {compounds ?? 'Every'} {compounds ? 'compounds, each lot' : 'lot'} verified by an independent ISO/IEC 17025 laboratory before it ships. Certificate included.
          </motion.p>
          <motion.div {...rise(0.38)} className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link to="/shop">
                Shop compounds <ArrowRightIcon weight="bold" data-icon="inline-end" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/coa-library">COA library</Link>
            </Button>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
