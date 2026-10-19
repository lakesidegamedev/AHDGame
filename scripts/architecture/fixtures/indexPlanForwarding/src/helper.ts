export type Plan = { collection: string };
type Db = { collection<_T>(name: string): unknown };
export function runPlans(db: Db, plans: readonly Plan[]): void {
  for (const plan of plans) db.collection<unknown>(plan.collection);
}
export function runMixedPlans(db: Db, plans: readonly Plan[]): void {
  for (const plan of plans) db.collection<unknown>(plan.collection);
}
export function runSpreadPlans(db: Db, plans: readonly Plan[]): void {
  for (const plan of plans) db.collection<unknown>(plan.collection);
}

export function runPropertyPlans(db: Db, plans: readonly Plan[]): void {
  for (const plan of plans) db.collection<unknown>(plan.collection);
}

export function runMutablePlans(db: Db, plans: readonly Plan[]): void {
  for (let plan of plans) {
    plan = { collection: String(Date.now()) };
    db.collection<unknown>(plan.collection);
  }
}

export function runComputedPlans(db: Db, plans: readonly Plan[]): void {
  for (const plan of plans) db.collection<unknown>(plan.collection);
}
