import {
  runPlans as forwardPlans,
  runMixedPlans,
  runSpreadPlans,
  runPropertyPlans,
  runMutablePlans,
  runComputedPlans,
  type Plan,
} from "./helper";
declare const db: { collection<_T>(name: string): unknown };
declare const unknownPlans: Plan[];
const plans: Plan[] = [{ collection: "fixturePlanA" }, { collection: "fixturePlanB" }];
const alias = plans;
export function callsite(): void {
  forwardPlans(db, alias);
  runMutablePlans(db, plans);
  runMixedPlans(db, [{ collection: "fixturePlanKnown" }]);
  runMixedPlans(db, unknownPlans);
  runSpreadPlans(db, [...plans]);
}

declare const unknownName: string;
function forwardProperty(name: string): void {
  runPropertyPlans(db, [{ collection: name }]);
}
forwardProperty("fixtureKnownProperty");
forwardProperty(unknownName);

const computedProperty: string = String(Date.now());
runComputedPlans(db, [{ collection: "fixtureShadowed", [computedProperty]: unknownName }]);
