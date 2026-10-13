import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { money } from '@/lib/format'
import type { Settings } from '@/lib/types'

export type PolicySlug = 'privacy' | 'refunds' | 'shipping' | 'terms' | 'research-use'

export interface PolicyDoc {
  slug: PolicySlug
  title: string
  short: string
  updated: string
  intro: ReactNode
  sections: { id: string; heading: string; body: ReactNode }[]
}

/** Values from store settings, with neutral wording while they load or if they fail. */
export function policyVars(s: Settings | undefined) {
  return {
    store: s?.storeName ?? 'KYVO',
    email: s?.supportEmail ?? null,
    membership: s?.features?.membership ?? false,
    flat: s ? money(s.shipping.flatCents) : 'a flat rate shown at checkout',
    free: s ? money(s.shipping.freeThresholdCents, { whole: true }) : 'the threshold shown at checkout',
    carrier: s?.shipping.carrier ?? 'a tracked courier',
    cutoff: s?.shipping.cutoff ?? 'the daily cutoff',
    rate: s ? `${s.affiliate.defaultRate}%` : 'the published rate',
    cookieDays: s ? `${s.affiliate.cookieDays} days` : 'the published attribution window',
    couponPct: s ? `${s.affiliate.couponPct}%` : 'the published discount',
    minPayout: s ? money(s.affiliate.minPayoutCents, { whole: true }) : 'the published minimum',
    commitMonths: s ? `${s.box.commitMonths}` : 'the stated number of',
    maxRedeem: s ? `${s.points.maxRedeemPct}%` : 'the published share',
    expiry: s ? `${s.points.expiryMonths} months` : 'the published period',
  }
}

type Vars = ReturnType<typeof policyVars>

const P = ({ children }: { children: ReactNode }) => <p>{children}</p>
const UL = ({ items }: { items: ReactNode[] }) => (
  <ul>
    {items.map((x, i) => (
      <li key={i}>{x}</li>
    ))}
  </ul>
)
const Mail = ({ v }: { v: Vars }) =>
  v.email ? (
    <a href={`mailto:${v.email}`}>{v.email}</a>
  ) : (
    <Link to="/contact">our contact page</Link>
  )

export function buildPolicies(v: Vars): PolicyDoc[] {
  return [
    {
      slug: 'privacy',
      title: 'Privacy notice',
      short: 'Privacy',
      updated: '2026-10-01',
      intro: (
        <>
          This notice explains how {v.store} Labs collects, uses and protects personal data, in line with Malaysia's Personal Data Protection Act 2010 (PDPA). It
          applies to this website, your account, orders and the partner program.
        </>
      ),
      sections: [
        {
          id: 'who-we-are',
          heading: 'Who we are',
          body: (
            <P>
              {v.store} Labs ("we", "us") runs this store and is the data user responsible for your personal data. You can reach us about anything in this
              notice at <Mail v={v} />.
            </P>
          ),
        },
        {
          id: 'what-we-collect',
          heading: 'What we collect',
          body: (
            <>
              <UL
                items={[
                  <><strong>Account details:</strong> name, email, phone number and a one-way hash of your password. We never store your password itself.</>,
                  <><strong>Order details:</strong> shipping address, items ordered, order history and points activity.</>,
                  <><strong>Payment status:</strong> payments are handled by ToyyibPay. We receive confirmation and a transaction reference, never your card number or online banking login.</>,
                  <><strong>Partner details:</strong> social handles, website, payout method and payment email if you join the partner program.</>,
                  <><strong>Technical data:</strong> IP address, browser type and pages visited, used for security, fraud prevention and to count referral clicks. Referral clicks are stored as a one-way hash, not your raw IP.</>,
                ]}
              />
              <P>You do not have to give us your data, but without your name, email and address we cannot process or deliver an order.</P>
            </>
          ),
        },
        {
          id: 'how-we-use-it',
          heading: 'How we use it',
          body: (
            <UL
              items={[
                'To process, ship and support your orders, including sending order and tracking emails.',
                'To run your account, points balance and Build a Box subscription.',
                'To credit partner commissions and send partner payouts.',
                'To prevent fraud, misuse of research products and abuse of the site.',
                'To meet legal, tax and accounting obligations.',
                'To send product news, only if you opted in. You can opt out at any time from any email.',
              ]}
            />
          ),
        },
        {
          id: 'sharing',
          heading: 'Who we share it with',
          body: (
            <>
              <P>We share only what each party needs to do its job:</P>
              <UL
                items={[
                  'Courier partners, to deliver your parcel.',
                  'ToyyibPay and participating banks, to process payment.',
                  'Hosting, email and IT providers that run our systems under confidentiality obligations.',
                  'Professional advisers such as auditors and lawyers.',
                  'Regulators, law enforcement or courts where Malaysian law requires it.',
                ]}
              />
              <P>We do not sell or rent personal data. Some providers may process data outside Malaysia; where they do, we use providers that protect it to a standard at least equivalent to the PDPA.</P>
            </>
          ),
        },
        {
          id: 'cookies',
          heading: 'Cookies and local storage',
          body: (
            <P>
              We use one essential cookie to keep you signed in. Your browser also stores your cart, theme preference and, if you arrived through a partner link,
              the partner code for {v.cookieDays}. We do not use third-party advertising cookies.
            </P>
          ),
        },
        {
          id: 'retention',
          heading: 'How long we keep it',
          body: (
            <P>
              Order and payment records are kept for seven years to meet Malaysian tax and company record rules. Account data is kept while your account is
              open and deleted or anonymised within a reasonable time after you ask us to close it, unless the law requires us to keep it longer.
            </P>
          ),
        },
        {
          id: 'security',
          heading: 'Security',
          body: (
            <P>
              Data is encrypted in transit, passwords are hashed, and access to customer records is limited to staff who need it. No system is perfectly
              secure, so please use a strong password that you do not use elsewhere.
            </P>
          ),
        },
        {
          id: 'your-rights',
          heading: 'Your rights',
          body: (
            <>
              <P>Under the PDPA you can:</P>
              <UL
                items={[
                  'Ask for a copy of the personal data we hold about you.',
                  'Ask us to correct data that is inaccurate, incomplete or out of date. You can update most details yourself in your account.',
                  'Withdraw consent to marketing, or limit how we process your data.',
                  'Ask us to close your account.',
                ]}
              />
              <P>
                Send requests to <Mail v={v} /> from the email on your account. We respond to access and correction requests within 21 days, as the PDPA
                requires. A Bahasa Malaysia version of this notice is available on request.
              </P>
            </>
          ),
        },
        {
          id: 'age',
          heading: 'Age',
          body: <P>Our store and partner program are only for people aged 21 or older. We do not knowingly collect data from anyone younger.</P>,
        },
        {
          id: 'changes',
          heading: 'Changes to this notice',
          body: <P>If we change how we use personal data in a meaningful way, we update this page and tell account holders by email.</P>,
        },
      ],
    },
    {
      slug: 'refunds',
      title: 'Returns and refunds',
      short: 'Refunds',
      updated: '2026-10-01',
      intro: <>We want every order to arrive right. If it does not, here is exactly what we do about it.</>,
      sections: [
        {
          id: 'unopened',
          heading: 'Unopened items: 14 days',
          body: (
            <>
              <P>
                You can return unopened items within 14 days of delivery for a refund. Items must be sealed, unused, in their original packaging and stored
                as the label directs since delivery.
              </P>
              <P>
                Email <Mail v={v} /> with your order number before sending anything back. Return postage is paid by you unless the return is because of our
                mistake. Refunds go to the original payment method within 7 business days of the return reaching us and passing inspection.
              </P>
            </>
          ),
        },
        {
          id: 'damaged',
          heading: 'Damaged or incorrect items',
          body: (
            <>
              <P>
                If an item arrives damaged, leaking, or is not what you ordered, tell us within 7 days of delivery with your order number and clear photos of
                the item, its label and the parcel. We send a replacement at no cost, and you do not need to return the original unless we ask.
              </P>
              <P>If a replacement is out of stock, we refund that item in full instead.</P>
            </>
          ),
        },
        {
          id: 'not-eligible',
          heading: 'What we cannot take back',
          body: (
            <UL
              items={[
                'Opened vials, or any item with a broken seal.',
                'Items not stored as the label directs after delivery.',
                'Returns requested more than 14 days after delivery.',
                'Items damaged after delivery.',
              ]}
            />
          ),
        },
        {
          id: 'cancellations',
          heading: 'Cancelling an order',
          body: (
            <P>
              You can cancel any order for a full refund until it is packed. Orders paid before {v.cutoff} usually ship the same day, so contact us quickly.
              Unpaid orders may be cancelled if payment is not completed within a few days.
            </P>
          ),
        },
        {
          id: 'box-membership',
          heading: v.membership ? 'Build a Box and memberships' : 'Build a Box',
          body: (
            <>
              <P>
                Build a Box has a minimum term of {v.commitMonths} monthly boxes. After that you can cancel any time from your account and no further boxes will
                ship. Boxes that have already shipped follow the rules above.
              </P>
              {v.membership && <P>Membership fees can be refunded within 14 days of purchase if you have not used any member points bonus.</P>}
            </>
          ),
        },
        {
          id: 'points-commission',
          heading: 'Points and partner commission',
          body: <P>When an order is refunded or cancelled, points earned on it are removed, points you spent on it are returned, and any partner commission on it is voided.</P>,
        },
      ],
    },
    {
      slug: 'shipping',
      title: 'Shipping policy',
      short: 'Shipping',
      updated: '2026-10-01',
      intro: <>We ship within Malaysia with tracking on every parcel.</>,
      sections: [
        {
          id: 'where',
          heading: 'Where we ship',
          body: <P>We deliver to addresses across Peninsular Malaysia, Sabah, Sarawak and Labuan. We do not currently ship outside Malaysia.</P>,
        },
        {
          id: 'dispatch',
          heading: 'Same-day dispatch',
          body: (
            <P>
              Orders paid before {v.cutoff} Malaysia time on a business day leave our facility the same day. Orders paid later, or on weekends and public
              holidays, ship the next business day. Payment by FPX or card is confirmed instantly.
            </P>
          ),
        },
        {
          id: 'cost',
          heading: 'Cost',
          body: (
            <UL
              items={[
                <>Standard tracked shipping is a flat <strong>{v.flat}</strong> per order.</>,
                <>Shipping is free on orders over <strong>{v.free}</strong>.</>,
                'The exact amount is always shown in your cart before you pay.',
              ]}
            />
          ),
        },
        {
          id: 'delivery',
          heading: 'Delivery times',
          body: (
            <>
              <P>We ship with {v.carrier}. Typical delivery after dispatch:</P>
              <UL items={['Peninsular Malaysia: 1 to 3 business days.', 'Sabah, Sarawak and Labuan: 3 to 7 business days.']} />
              <P>These are courier estimates rather than guarantees, and can stretch during festive seasons and severe weather.</P>
            </>
          ),
        },
        {
          id: 'tracking',
          heading: 'Tracking',
          body: (
            <P>
              Your tracking number is emailed as soon as the parcel ships and is shown on your order page and in{' '}
              <Link to="/account">your account</Link>.
            </P>
          ),
        },
        {
          id: 'packaging',
          heading: 'Packaging',
          body: (
            <P>
              Vials are packed in protective inserts inside plain outer packaging with no product names on the outside. Store each item as its label directs
              once it arrives.
            </P>
          ),
        },
        {
          id: 'problems',
          heading: 'Delays, lost parcels and failed delivery',
          body: (
            <>
              <P>
                If tracking has not moved for 5 business days, email <Mail v={v} />. We open a claim with the courier and, if the parcel is confirmed lost, we
                reship or refund it.
              </P>
              <P>
                Please check your address carefully. If a parcel is returned to us because the address was wrong or it was not collected, we can resend it once
                the shipping cost is paid again.
              </P>
            </>
          ),
        },
      ],
    },
    {
      slug: 'terms',
      title: 'Terms of sale',
      short: 'Terms',
      updated: '2026-10-01',
      intro: <>These terms apply when you use this website, open an account, place an order or join the partner program. Please read them with the research use policy.</>,
      sections: [
        {
          id: 'eligibility',
          heading: 'Who can buy',
          body: (
            <P>
              You must be 21 or older and buying for legitimate laboratory research. By ordering you confirm both, and that you have read the{' '}
              <Link to="/policies/research-use">research use policy</Link>.
            </P>
          ),
        },
        {
          id: 'products',
          heading: 'Products',
          body: (
            <P>
              All products are sold strictly for in vitro laboratory research. They are not medicines, food, supplements or cosmetics, and have not been
              registered with or evaluated by Malaysia's National Pharmaceutical Regulatory Agency (NPRA) for use in humans or animals. Product descriptions and
              certificates of analysis describe identity and purity only.
            </P>
          ),
        },
        {
          id: 'account',
          heading: 'Your account',
          body: (
            <P>
              Keep your details accurate and your password private. You are responsible for orders placed from your account. We may suspend or close accounts
              used for fraud, abuse or any use that conflicts with the research use policy.
            </P>
          ),
        },
        {
          id: 'prices',
          heading: 'Prices and orders',
          body: (
            <>
              <P>
                Prices are in Malaysian ringgit (RM). Quantity pricing, member discounts, codes and points are calculated by our checkout and shown before you
                pay. A contract is formed when we confirm your payment.
              </P>
              <P>
                If an item is listed at a clearly wrong price, or we cannot fulfil an order, we will contact you and refund any payment in full. We may refuse
                or cancel orders we reasonably believe are intended for non-research use.
              </P>
            </>
          ),
        },
        {
          id: 'payment',
          heading: 'Payment',
          body: (
            <P>
              Online payments are processed by ToyyibPay using FPX online banking or debit and credit cards. You are redirected to ToyyibPay to pay, and we never
              see your card or banking credentials. Orders are processed once payment is confirmed. If a payment does not go through, you can retry from the
              order page.
            </P>
          ),
        },
        {
          id: 'shipping-returns',
          heading: 'Shipping and returns',
          body: (
            <P>
              Delivery is covered by our <Link to="/policies/shipping">shipping policy</Link> and returns by our{' '}
              <Link to="/policies/refunds">returns and refunds policy</Link>. Risk in the goods passes to you on delivery.
            </P>
          ),
        },
        {
          id: 'points',
          heading: v.membership ? 'Points, membership and Build a Box' : 'Points and Build a Box',
          body: (
            <UL
              items={[
                <>100 points are worth {money(100)} at checkout. Points can cover up to {v.maxRedeem} of an order, have no cash value and expire {v.expiry} after they are earned.</>,
                ...(v.membership ? ['Membership tiers change your points earning rate and shipping benefits for as long as the membership is active.'] : []),
                <>Build a Box subscriptions have a minimum term of {v.commitMonths} monthly boxes, then can be cancelled from your account.</>,
                v.membership
                  ? 'We may adjust earning rates or membership benefits for the future. Points already in your balance keep their value.'
                  : 'We may adjust earning rates for the future. Points already in your balance keep their value.',
              ]}
            />
          ),
        },
        {
          id: 'partner-program',
          heading: 'Partner program terms',
          body: (
            <>
              <P>These terms apply to anyone accepted into the {v.store} partner program, in addition to everything above.</P>
              <UL
                items={[
                  <><strong>Commission.</strong> Approved partners earn {v.rate} of the order value after discounts and points, excluding shipping and tax, unless we agree a different rate with you in writing.</>,
                  <><strong>Attribution.</strong> An order is credited to you if the shopper uses your code, or places it within {v.cookieDays} of last clicking your link. Where more than one partner is involved, the code used at checkout wins, then the last link clicked.</>,
                  <><strong>Shopper discount.</strong> Your code gives shoppers {v.couponPct} off standard orders. It cannot be combined with other codes.</>,
                  <><strong>Commission status.</strong> Commission is pending until the order is delivered, then available. Commission on cancelled, refunded or charged-back orders is void.</>,
                  <><strong>Payouts.</strong> You can request a payout once your available balance reaches {v.minPayout}. We pay by bank transfer to the Malaysian bank account on your dashboard, usually within 3 business days of a request. You are responsible for any tax on your earnings.</>,
                  <><strong>Promotion rules.</strong> Describe products as research materials only. Do not give dosing, administration or protocol advice, and do not claim or imply any health, treatment, cosmetic or performance benefit.</>,
                  <><strong>Not allowed.</strong> Self-referrals or orders by your household, bidding on {v.store} brand terms in paid search, posting your code on coupon sites, spam, and pretending to be {v.store} or speaking on our behalf.</>,
                  <><strong>Ending the agreement.</strong> Either side can end it at any time. We may suspend or close a partner account and void unpaid commission connected to a breach of these rules. Valid commission earned before closure is paid out once it becomes available.</>,
                  <><strong>Changes.</strong> We may change rates or terms for future orders with at least 14 days' notice by email.</>,
                ]}
              />
            </>
          ),
        },
        {
          id: 'liability',
          heading: 'Liability',
          body: (
            <P>
              To the extent the law allows, our total liability for any order is limited to the amount you paid for it, and we are not liable for losses
              arising from use of products outside the research use policy. Nothing in these terms excludes rights that cannot be excluded under Malaysian law.
            </P>
          ),
        },
        {
          id: 'law',
          heading: 'Governing law',
          body: <P>These terms are governed by the laws of Malaysia, and the courts of Malaysia have jurisdiction over any dispute.</P>,
        },
        {
          id: 'contact',
          heading: 'Contact and changes',
          body: (
            <P>
              We may update these terms; the version on this page at the time of your order applies to that order. Questions go to <Mail v={v} />.
            </P>
          ),
        },
      ],
    },
    {
      slug: 'research-use',
      title: 'Research use policy',
      short: 'Research use',
      updated: '2026-10-01',
      intro: <>Every product we sell is a research material. This policy sets out what that means for you as a buyer.</>,
      sections: [
        {
          id: 'laboratory-only',
          heading: 'Laboratory in vitro use only',
          body: (
            <P>
              Our products are supplied only for in vitro research: experiments carried out in a laboratory setting, outside a living organism, by people
              qualified to handle research chemicals.
            </P>
          ),
        },
        {
          id: 'not-for-use',
          heading: 'Not for human or veterinary use',
          body: (
            <>
              <P>Products must not be used in or on people or animals in any way. That includes:</P>
              <UL
                items={[
                  'Injection, ingestion, inhalation or application to skin.',
                  'Diagnostic, therapeutic or preventive use of any kind.',
                  'Use as food, a supplement, a cosmetic or a household product.',
                ]}
              />
            </>
          ),
        },
        {
          id: 'no-advice',
          heading: 'We do not give usage advice',
          body: (
            <P>
              Our team and our partners do not provide dosing, administration, reconstitution for personal use or protocol advice, and will not answer questions
              about personal use. Product pages and certificates of analysis describe identity, purity and storage only.
            </P>
          ),
        },
        {
          id: 'buyer-responsibility',
          heading: 'Your responsibilities',
          body: (
            <UL
              items={[
                'You are 21 or older and qualified to handle research chemicals.',
                'You handle, store and dispose of products following good laboratory practice and the label.',
                'You comply with every law and regulation that applies to you and your research.',
                'You keep products away from anyone not qualified to handle them.',
                'You do not resell products for non-research use.',
              ]}
            />
          ),
        },
        {
          id: 'refusal',
          heading: 'Refusing or cancelling orders',
          body: (
            <P>
              We may refuse or cancel an order, and close the account, if we reasonably believe products will be used outside this policy. That includes
              messages, reviews or social posts describing personal use.
            </P>
          ),
        },
        {
          id: 'acknowledgement',
          heading: 'Acknowledgement',
          body: (
            <P>
              By placing an order you confirm you have read and accept this policy. Questions about it go to <Mail v={v} />.
            </P>
          ),
        },
      ],
    },
  ]
}
