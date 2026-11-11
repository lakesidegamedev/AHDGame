/** January 2027 House allocation from the dated, explicitly provisional 2026 snapshot. */
import snapshot from "./us2026ResultsSnapshot.json";
import { provisionalHouseSeats } from "../rules/provisionalOpeningSeats";

export const US_HOUSE_2027 = provisionalHouseSeats(snapshot.house);
