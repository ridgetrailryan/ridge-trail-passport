import { CONFIG } from "./config.js";
import { isCompletionEligible, milesFor } from "./trails.js";

function segmentIdFor(properties = {}) {
  return String(properties.Segment_ID || "").trim();
}

function defaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function loadProgress(storage) {
  if (!storage) return {};

  try {
    const parsed = JSON.parse(storage.getItem(CONFIG.storageKey) || "{}");

    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

export function createProgressStore({ storage = defaultStorage() } = {}) {
  let progress = loadProgress(storage);
  let invalidSegmentIds = new Set();

  function keyFor(properties) {
    const segmentId = segmentIdFor(properties);

    if (!segmentId || invalidSegmentIds.has(segmentId)) {
      return null;
    }

    return `segment-${segmentId}`;
  }

  function persist() {
    if (!storage) return false;

    try {
      storage.setItem(CONFIG.storageKey, JSON.stringify(progress));
      return true;
    } catch (error) {
      console.warn("Could not persist Ridge Trail completion data", error);
      return false;
    }
  }

  function isDone(properties) {
    if (!isCompletionEligible(properties)) return false;

    const key = keyFor(properties);
    return key ? Boolean(progress[key]) : false;
  }

  return {
    isDone,

    setInvalidSegmentIds(segmentIds = []) {
      invalidSegmentIds = new Set(
        segmentIds
          .map((value) => String(value ?? "").trim())
          .filter(Boolean)
      );
    },

    toggle(properties) {
      if (!isCompletionEligible(properties)) return null;

      const key = keyFor(properties);
      if (!key) return null;

      if (progress[key]) {
        delete progress[key];
      } else {
        progress[key] = {
          completedAt: new Date().toISOString()
        };
      }

      persist();
      return Boolean(progress[key]);
    },

    reset() {
      progress = {};

      if (!storage) return;

      try {
        storage.removeItem(CONFIG.storageKey);
      } catch (error) {
        console.warn("Could not clear Ridge Trail completion data", error);
      }
    },

    stats(features) {
      const eligible = features.filter((feature) =>
        isCompletionEligible(feature.properties)
      );

      const done = eligible.filter((feature) =>
        isDone(feature.properties)
      );

      const totalMiles = eligible.reduce(
        (sum, feature) => sum + milesFor(feature.properties),
        0
      );

      const completedMiles = done.reduce(
        (sum, feature) => sum + milesFor(feature.properties),
        0
      );

      return {
        completedCount: done.length,
        totalCount: eligible.length,
        completedMiles,
        totalMiles,
        percent: eligible.length
          ? Math.round((done.length / eligible.length) * 100)
          : 0
      };
    }
  };
}
