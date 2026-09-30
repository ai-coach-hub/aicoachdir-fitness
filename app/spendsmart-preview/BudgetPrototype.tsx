"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import styles from "./budget.module.css";

type IncomeLine = {
  id: string;
  name: string;
  amount: number;
};

type BudgetLine = {
  id: string;
  name: string;
  target: number;
  spent: number;
};

type BudgetGroup = {
  id: string;
  name: string;
  lines: BudgetLine[];
};

const SAMPLE_INCOME: IncomeLine[] = [
  { id: "pay-1", name: "Paycheck 1", amount: 2800 },
  { id: "pay-2", name: "Paycheck 2", amount: 2800 },
  { id: "other-income", name: "Other income", amount: 250 },
];

const SAMPLE_GROUPS: BudgetGroup[] = [
  {
    id: "home",
    name: "Home & essentials",
    lines: [
      { id: "housing", name: "Housing", target: 1800, spent: 1800 },
      { id: "utilities", name: "Utilities", target: 320, spent: 265 },
      { id: "groceries", name: "Groceries", target: 650, spent: 418 },
      { id: "transportation", name: "Transportation", target: 450, spent: 301 },
    ],
  },
  {
    id: "goals",
    name: "Goals & obligations",
    lines: [
      { id: "savings", name: "Emergency savings", target: 350, spent: 350 },
      { id: "debt", name: "Debt payments", target: 600, spent: 600 },
      { id: "insurance", name: "Insurance", target: 275, spent: 275 },
    ],
  },
  {
    id: "flex",
    name: "Flexible spending",
    lines: [
      { id: "dining", name: "Dining out", target: 250, spent: 166 },
      { id: "subscriptions", name: "Subscriptions", target: 85, spent: 64 },
      { id: "personal", name: "Personal & household", target: 220, spent: 132 },
      { id: "fun", name: "Entertainment", target: 180, spent: 95 },
    ],
  },
];

function toMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function safeNumber(raw: string) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

export default function BudgetPrototype() {
  const [income, setIncome] = useState<IncomeLine[]>(SAMPLE_INCOME);
  const [groups, setGroups] = useState<BudgetGroup[]>(SAMPLE_GROUPS);

  const totals = useMemo(() => {
    const moneyIn = income.reduce((sum, line) => sum + line.amount, 0);
    const target = groups.reduce(
      (sum, group) =>
        sum + group.lines.reduce((groupSum, line) => groupSum + line.target, 0),
      0,
    );
    const spent = groups.reduce(
      (sum, group) =>
        sum + group.lines.reduce((groupSum, line) => groupSum + line.spent, 0),
      0,
    );

    return {
      moneyIn,
      target,
      spent,
      unassigned: moneyIn - target,
      available: moneyIn - spent,
    };
  }, [income, groups]);

  const updateIncome = (id: string, field: "name" | "amount", value: string) => {
    setIncome((current) =>
      current.map((line) =>
        line.id === id
          ? {
              ...line,
              [field]: field === "amount" ? safeNumber(value) : value,
            }
          : line,
      ),
    );
  };

  const updateBudgetLine = (
    groupId: string,
    lineId: string,
    field: "name" | "target" | "spent",
    value: string,
  ) => {
    setGroups((current) =>
      current.map((group) =>
        group.id === groupId
          ? {
              ...group,
              lines: group.lines.map((line) =>
                line.id === lineId
                  ? {
                      ...line,
                      [field]:
                        field === "name" ? value : safeNumber(value),
                    }
                  : line,
              ),
            }
          : group,
      ),
    );
  };

  const addIncome = () => {
    setIncome((current) => [
      ...current,
      {
        id: `income-${Date.now()}`,
        name: "New income",
        amount: 0,
      },
    ]);
  };

  const addCategory = () => {
    setGroups((current) =>
      current.map((group) =>
        group.id === "flex"
          ? {
              ...group,
              lines: [
                ...group.lines,
                {
                  id: `category-${Date.now()}`,
                  name: "New category",
                  target: 0,
                  spent: 0,
                },
              ],
            }
          : group,
      ),
    );
  };

  const resetSample = () => {
    setIncome(SAMPLE_INCOME);
    setGroups(SAMPLE_GROUPS);
  };

  const allocationStatus =
    totals.unassigned === 0
      ? "Fully assigned"
      : totals.unassigned > 0
        ? `${toMoney(totals.unassigned)} not assigned yet`
        : `${toMoney(Math.abs(totals.unassigned))} over target`;

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>AI COACH DIRECTORY · DEVELOPMENT PREVIEW</p>
          <h1>SpendSmart monthly budget</h1>
          <p className={styles.subhead}>
            Plan what comes in, organize where it should go, and compare the plan
            with real spending throughout the month.
          </p>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.previewBadge}>Not live</span>
          <Link href="/" className={styles.backLink}>
            Back to site
          </Link>
        </div>
      </header>

      <section className={styles.notice} aria-label="Preview status">
        <strong>Prototype only.</strong> Changes on this page stay in your browser
        until refresh. Nothing here connects to Pickaxe, Stripe, bank accounts, or
        the live fitness coach.
      </section>

      <section className={styles.summaryGrid} aria-label="Monthly budget summary">
        <article>
          <span>Money in</span>
          <strong>{toMoney(totals.moneyIn)}</strong>
          <small>Expected income this month</small>
        </article>
        <article>
          <span>Budget targets</span>
          <strong>{toMoney(totals.target)}</strong>
          <small>{allocationStatus}</small>
        </article>
        <article>
          <span>Money out</span>
          <strong>{toMoney(totals.spent)}</strong>
          <small>Recorded spending so far</small>
        </article>
        <article>
          <span>Cash not spent</span>
          <strong>{toMoney(totals.available)}</strong>
          <small>Income minus recorded outflow</small>
        </article>
      </section>

      <div className={styles.layout}>
        <section className={styles.workspace} aria-labelledby="month-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.kicker}>MONTHLY PLAN</p>
              <h2 id="month-title">September 2026</h2>
            </div>
            <button type="button" onClick={resetSample} className={styles.secondaryButton}>
              Reset sample
            </button>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <h3>Income</h3>
                <p>Enter each source you expect to receive this month.</p>
              </div>
              <button type="button" onClick={addIncome} className={styles.textButton}>
                + Add income
              </button>
            </div>

            <div className={styles.incomeList}>
              {income.map((line) => (
                <div className={styles.incomeRow} key={line.id}>
                  <label>
                    <span className={styles.srOnly}>Income source</span>
                    <input
                      value={line.name}
                      onChange={(event) =>
                        updateIncome(line.id, "name", event.target.value)
                      }
                      className={styles.nameInput}
                    />
                  </label>
                  <label className={styles.moneyField}>
                    <span>$</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="decimal"
                      value={line.amount}
                      onChange={(event) =>
                        updateIncome(line.id, "amount", event.target.value)
                      }
                      aria-label={`${line.name} amount`}
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>

          {groups.map((group) => {
            const groupTarget = group.lines.reduce(
              (sum, line) => sum + line.target,
              0,
            );
            const groupSpent = group.lines.reduce(
              (sum, line) => sum + line.spent,
              0,
            );

            return (
              <div className={styles.panel} key={group.id}>
                <div className={styles.panelHeading}>
                  <div>
                    <h3>{group.name}</h3>
                    <p>
                      {toMoney(groupSpent)} out of {toMoney(groupTarget)} used
                    </p>
                  </div>
                  {group.id === "flex" ? (
                    <button
                      type="button"
                      onClick={addCategory}
                      className={styles.textButton}
                    >
                      + Add category
                    </button>
                  ) : null}
                </div>

                <div className={styles.tableWrap}>
                  <div className={styles.tableHeader} aria-hidden="true">
                    <span>Category</span>
                    <span>Target</span>
                    <span>Outflow</span>
                    <span>Left</span>
                  </div>

                  {group.lines.map((line) => {
                    const remaining = line.target - line.spent;

                    return (
                      <div className={styles.budgetRow} key={line.id}>
                        <label className={styles.categoryCell}>
                          <span className={styles.srOnly}>Category name</span>
                          <input
                            value={line.name}
                            onChange={(event) =>
                              updateBudgetLine(
                                group.id,
                                line.id,
                                "name",
                                event.target.value,
                              )
                            }
                            className={styles.nameInput}
                          />
                        </label>

                        <label className={styles.moneyField}>
                          <span>$</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            inputMode="decimal"
                            value={line.target}
                            onChange={(event) =>
                              updateBudgetLine(
                                group.id,
                                line.id,
                                "target",
                                event.target.value,
                              )
                            }
                            aria-label={`${line.name} target`}
                          />
                        </label>

                        <label className={styles.moneyField}>
                          <span>$</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            inputMode="decimal"
                            value={line.spent}
                            onChange={(event) =>
                              updateBudgetLine(
                                group.id,
                                line.id,
                                "spent",
                                event.target.value,
                              )
                            }
                            aria-label={`${line.name} outflow`}
                          />
                        </label>

                        <strong
                          className={
                            remaining < 0
                              ? styles.negativeAmount
                              : styles.remainingAmount
                          }
                        >
                          {toMoney(remaining)}
                        </strong>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>

        <aside className={styles.coachRail} aria-label="SpendSmart coach preview">
          <div className={styles.coachCard}>
            <p className={styles.kicker}>SPENDSMART COACH</p>
            <h2>Coach connection intentionally off</h2>
            <p>
              The budgeting engine comes first. Once the monthly budget, categories,
              tracking, and persistence are approved, this panel can connect to a
              separate Pickaxe coach without touching the live fitness coach.
            </p>
            <div className={styles.coachExample}>
              <span>Future examples</span>
              <p>“Where am I overspending this month?”</p>
              <p>“Help me adjust groceries without changing my savings goal.”</p>
              <p>“What bills do I still need to plan for before my next paycheck?”</p>
            </div>
            <button
              type="button"
              className={styles.disabledButton}
              disabled
              title="Pickaxe connection is disabled in this development preview"
            >
              AI Coach disabled in preview
            </button>
          </div>

          <div className={styles.guardrailCard}>
            <h3>Product guardrails</h3>
            <ul>
              <li>Budget education and organization, not individualized investment advice.</li>
              <li>No bank connection in the first build.</li>
              <li>No copying of third-party wording, artwork, layout, or branding.</li>
              <li>Separate data, prompts, products, and usage limits from Fitness.</li>
            </ul>
          </div>
        </aside>
      </div>
    </main>
  );
}
