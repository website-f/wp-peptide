import { Link } from 'react-router'
import { PageHeader } from '@/components/brand/bits'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { faqs, type FaqItem } from '@/lib/content'
import { useSettings } from '@/lib/queries'
import { useSeo } from '@/lib/seo'

const GROUPS: FaqItem['group'][] = ['Ordering', 'Quality', 'Shipping', 'Programs']

export default function Faq() {
  useSeo({ title: 'FAQ', description: 'Answers about ordering, payment, shipping, certificates of analysis and research use.' })
  const { data: s } = useSettings()
  const list = faqs(s)
  return (
    <>
      <PageHeader title="Questions, answered" intro="Short answers about ordering, testing, shipping and our programs." />
      <div className="container-x grid gap-12 pb-20 lg:grid-cols-[200px_1fr]">
        <nav className="hidden lg:block" aria-label="FAQ sections">
          <ul className="sticky top-24 grid gap-1 text-sm">
            {GROUPS.map((g) => (
              <li key={g}>
                <a href={`#${g.toLowerCase()}`} className="block rounded-md px-2 py-1.5 text-muted-foreground hover:text-foreground">
                  {g}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="grid gap-12">
          {GROUPS.map((g) => (
            <section key={g} id={g.toLowerCase()} className="scroll-mt-24">
              <h2 className="display text-3xl sm:text-4xl">{g}</h2>
              <Accordion type="multiple" className="mt-4 border-t">
                {list
                  .filter((f) => f.group === g)
                  .map((f) => (
                    <AccordionItem key={f.q} value={f.q}>
                      <AccordionTrigger className="py-5 text-left text-base font-medium hover:no-underline">{f.q}</AccordionTrigger>
                      <AccordionContent className="pb-5 text-[15px] leading-relaxed text-muted-foreground">{f.a}</AccordionContent>
                    </AccordionItem>
                  ))}
              </Accordion>
            </section>
          ))}
          <p className="text-muted-foreground">
            Still stuck?{' '}
            <Link to="/contact" className="text-gold-ink hover:underline">
              Contact us
            </Link>
            .
          </p>
        </div>
      </div>
    </>
  )
}
