import { loadSpots } from "../src/content/load.ts";
import { contentMode } from "../src/content/mode.ts";

const { root } = contentMode();
const spots = await loadSpots(root);
console.log(`Validated ${spots.length} spot(s) in ${root}`);
