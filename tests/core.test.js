import test from "node:test";
import assert from "node:assert/strict";

import { CONFIG } from "../src/config.js";
import { uniqueValues, validateSegmentIds } from "../src/data.js";
import { createProgressStore } from "../src/progress.js";
import {
  getFeatureEndpoints,
  isCompletionEligible,
  isSideTrail,
  milesFor,
  trailTypeLabel
} from "../src/trails.js";
import { normalizeUrl } from "../src/utils.js";

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function makeFeature(properties = {}, geometry = null) {
  return { type: "Feature", properties, geometry };
}

test("trail rules keep Primary and Restricted completion-eligible", () => {
  assert.equal(isCompletionEligible({ Trail_Type: "Primary" }), true);
  assert.equal(isCompletionEligible({ Trail_Type: "Restricted" }), true);
  assert.equal(isCompletionEligible({ Trail_Type: "Spur" }), false);
  assert.equal(isSideTrail({ Trail_Type: "Connector" }), true);
  assert.equal(isSideTrail({ Trail_Type: "Parallel" }), true);
  assert.equal(trailTypeLabel({ Trail_Type: "Restricted" }), "Primary Trail with Restricted Access");
});

test("mileage rejects invalid or negative values", () => {
  assert.equal(milesFor({ Calculated_Mileage: "5.25" }), 5.25);
  assert.equal(milesFor({ Calculated_Mileage: -2 }), 0);
  assert.equal(milesFor({ Calculated_Mileage: "not-a-number" }), 0);
});

test("endpoint extraction handles LineString and MultiLineString safely", () => {
  const line = makeFeature({}, {
    type: "LineString",
    coordinates: [[-122.5, 37.5], [-122.4, 37.6]]
  });

  assert.deepEqual(getFeatureEndpoints(line), {
    start: [37.5, -122.5],
    end: [37.6, -122.4]
  });

  const multi = makeFeature({}, {
    type: "MultiLineString",
    coordinates: [
      [[-122.5, 37.5], [-122.45, 37.55]],
      [[-122.4, 37.6], [-122.3, 37.7]]
    ]
  });

  assert.deepEqual(getFeatureEndpoints(multi), {
    start: [37.5, -122.5],
    end: [37.7, -122.3]
  });

  assert.equal(getFeatureEndpoints(makeFeature({}, {
    type: "LineString",
    coordinates: [["bad", 37.5], [-122.4, 37.6]]
  })), null);
});

test("Segment ID QA catches missing and duplicate permanent IDs", () => {
  const result = validateSegmentIds([
    makeFeature({ OBJECTID: 1, Segment_ID: "SEG-001" }),
    makeFeature({ OBJECTID: 2, Segment_ID: "SEG-001" }),
    makeFeature({ OBJECTID: 3, Segment_ID: "" })
  ]);

  assert.equal(result.valid, false);
  assert.deepEqual(result.duplicateSegmentIds, ["SEG-001"]);
  assert.deepEqual(result.missingObjectIds, [3]);
});

test("filter values are trimmed, unique, and sorted", () => {
  const features = [
    makeFeature({ County: "Marin" }),
    makeFeature({ County: " San Mateo " }),
    makeFeature({ County: "Marin" }),
    makeFeature({ County: null })
  ];

  assert.deepEqual(uniqueValues(features, "County"), ["Marin", "San Mateo"]);
});

test("completion persists only by permanent Segment ID", () => {
  const storage = new MemoryStorage();
  const store = createProgressStore({ storage });
  const primary = { Trail_Type: "Primary", Segment_ID: "SEG-001", OBJECTID: 10 };
  const sameSegmentNewObjectId = { Trail_Type: "Primary", Segment_ID: "SEG-001", OBJECTID: 999 };
  const missingSegmentId = { Trail_Type: "Primary", OBJECTID: 11 };
  const sideTrail = { Trail_Type: "Spur", Segment_ID: "SEG-200", OBJECTID: 12 };

  assert.equal(store.toggle(primary), true);
  assert.equal(store.isDone(sameSegmentNewObjectId), true);
  assert.equal(store.toggle(missingSegmentId), null);
  assert.equal(store.toggle(sideTrail), null);

  const reloaded = createProgressStore({ storage });
  assert.equal(reloaded.isDone(primary), true);

  reloaded.reset();
  assert.equal(storage.getItem(CONFIG.storageKey), null);
});

test("duplicate Segment IDs are blocked from sharing completion state", () => {
  const storage = new MemoryStorage();
  const store = createProgressStore({ storage });
  const duplicate = { Trail_Type: "Primary", Segment_ID: "SEG-DUPLICATE", OBJECTID: 20 };

  store.setInvalidSegmentIds(["SEG-DUPLICATE"]);

  assert.equal(store.toggle(duplicate), null);
  assert.equal(store.isDone(duplicate), false);
  assert.equal(storage.getItem(CONFIG.storageKey), null);
});

test("malformed saved progress is ignored instead of breaking the app", () => {
  const storage = new MemoryStorage();
  storage.setItem(CONFIG.storageKey, "{not-json");

  const store = createProgressStore({ storage });
  assert.equal(store.isDone({ Trail_Type: "Primary", Segment_ID: "SEG-001" }), false);
});

test("external links accept only http and https URLs", () => {
  assert.equal(normalizeUrl(" https://ridgetrail.org/path "), "https://ridgetrail.org/path");
  assert.equal(normalizeUrl("javascript:alert(1)"), null);
  assert.equal(normalizeUrl("mailto:test@example.com"), null);
  assert.equal(normalizeUrl("not a url"), null);
});
