# Floor — START HERE

**Know the price below which a job loses you money.**

For owner-operators of small trades and home-service businesses.

## The problem it solves

Your rent, insurance, admin, software and van are paid whether or not you win
the job. A quote that covers labour and materials still loses money, because
none of those fixed costs got recovered. Most quoting is done on labour plus
materials plus a feeling, and the feeling is usually wrong by exactly the amount
of overhead nobody allocated.

## What it does

1. You enter four figures once: annual overhead, billable hours per year, what
   an hour of labour costs you, and the margin you want.
2. It computes your **overhead recovery rate** — what every billable hour must
   contribute before any job makes you anything.
3. For each job you add, it computes the **true cost** including that overhead,
   the **break-even price floor**, the **target price** at your margin, and the
   **yield per hour** the job actually returned.
4. With three or more jobs it compares cost patterns and names the component
   that ate the margin on each one — materials, travel, subcontractor, or simply
   hours against price.
5. It exports to CSV for your spreadsheet, or a printable report.

## Start in under two minutes

Open the app and press **See it with example figures**. A worked five-job
example loads immediately, so you can see the output before typing anything.
Then press **Clear everything** and put your own numbers in.

## What it is not

- It is not accounting, tax, or financial advice. It is arithmetic on figures
  you supply.
- It does not connect to your accounting software, bank, or invoicing system.
- It does not sync between devices.
- It does not require an account, and it collects nothing.

## Your data

Everything stays in your browser's local storage. There is no server, no
database, no analytics, and the application makes no network requests at all.
Clearing your browser data removes your figures — export anything you need to
keep.

## Running it locally

```
npm run serve     # http://127.0.0.1:8098
npm test          # 39 unit tests over the calculation engine
npm run e2e       # 15 browser checks against the served app
```

## Licence

© Sentinel Fortune LLC. All rights reserved. Not for redistribution.
