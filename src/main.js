import "./styles.css";
import "./detail-photo.css";
import "./desktop.css";
import "./mobile-panel.css";

import { fetchTrailFeatures, uniqueValues, validateSegmentIds } from "./data.js";
import { createRidgeMap } from "./map.js";
import {
  readCachedTrailFeatures,
  registerServiceWorker,
  sameTrailSnapshot,
  writeCachedTrailFeatures
} from "./offline.js";
import { createProgressStore } from "./progress.js";
import { createUI } from "./ui.js";
import { isCompletionEligible } from "./trails.js";
import { $ } from "./utils.js";

let features = [];
let selectedObjectId = null;
let refreshInFlight = null;
let lastNetworkRefresh = 0;

const progressStore = createProgressStore();

let ridgeMap;
let ui;

function selectedFeature() {
  return (
    features.find(
      (feature) => feature.properties.OBJECTID === selectedObjectId
    ) || null
  );
}

function visibleFeatures() {
  return ui.filterFeatures(features);
}

function renderAll() {
  const visible = visibleFeatures();

  ridgeMap.render(visible, selectedObjectId);
  ui.renderProgress(features);
  ui.renderList(features, selectedObjectId);
  ui.renderDetails(selectedFeature());
}

function selectFeature(feature, { fit = false } = {}) {
  selectedObjectId = feature.properties.OBJECTID;

  renderAll();
  ui.scrollSelectedIntoView(selectedObjectId);

  if (fit) {
    ridgeMap.fitToFeature(feature);
  }
}

function clearSelection() {
  if (selectedObjectId == null) return;

  selectedObjectId = null;
  renderAll();
}

function goHome() {
  selectedObjectId = null;
  renderAll();

  const app = $("app");
  const panelButton = $("mobilePanelToggle");
  app.classList.remove("mobile-panel-open");

  if (panelButton) {
    panelButton.setAttribute("aria-expanded", "false");
    panelButton.setAttribute("aria-label", "Expand section browser");
  }

  ridgeMap.resetView();
}

function toggleComplete(feature, { keepDetailsOpen = false } = {}) {
  const properties = feature.properties;

  if (!isCompletionEligible(properties)) {
    ui.showStatus(
      "Side trails do not count toward Ridge Trail completion."
    );
    return;
  }

  const nowComplete = progressStore.toggle(properties);

  if (nowComplete == null) {
    ui.showStatus(
      "This section has a Segment ID data issue and cannot be saved yet.",
      4500
    );
    return;
  }

  renderAll();

  if (keepDetailsOpen) {
    ui.scrollSelectedIntoView(selectedObjectId);
  } else {
    ui.showStatus(
      nowComplete
        ? "Section marked complete ✓"
        : "Completion removed."
    );
  }
}

function handleFiltersChange() {
  const visibleObjectIds = new Set(
    visibleFeatures().map((feature) => feature.properties.OBJECTID)
  );

  if (
    selectedObjectId != null &&
    !visibleObjectIds.has(selectedObjectId)
  ) {
    selectedObjectId = null;
  }

  renderAll();
}

function resetProgress() {
  if (
    !window.confirm(
      "Clear all completed sections saved in this browser?"
    )
  ) {
    return;
  }

  progressStore.reset();
  selectedObjectId = null;
  renderAll();
  ui.showStatus("Progress reset.");
}

function initializeMobilePanelToggle() {
  const app = $("app");
  const button = $("mobilePanelToggle");

  if (!button) return;

  button.addEventListener("click", () => {
    const expanded = app.classList.toggle("mobile-panel-open");
    button.setAttribute("aria-expanded", String(expanded));
    button.setAttribute(
      "aria-label",
      expanded ? "Collapse section browser" : "Expand section browser"
    );
  });
}

function applyTrailFeatures(nextFeatures, { showQaWarning = false } = {}) {
  const previousCounty = $("county").value;
  const previousRegion = $("region").value;

  features = nextFeatures;

  if (
    selectedObjectId != null &&
    !features.some(
      (feature) => feature?.properties?.OBJECTID === selectedObjectId
    )
  ) {
    selectedObjectId = null;
  }

  const segmentIdQa = validateSegmentIds(features);
  progressStore.setInvalidSegmentIds(segmentIdQa.duplicateSegmentIds);

  if (!segmentIdQa.valid) {
    console.warn("Segment_ID QA warning", segmentIdQa);

    if (showQaWarning) {
      const issues = [];

      if (segmentIdQa.missingObjectIds.length) {
        issues.push(
          `${segmentIdQa.missingObjectIds.length} missing Segment ID${
            segmentIdQa.missingObjectIds.length === 1 ? "" : "s"
          }`
        );
      }

      if (segmentIdQa.duplicateSegmentIds.length) {
        issues.push(
          `${segmentIdQa.duplicateSegmentIds.length} duplicate Segment ID${
            segmentIdQa.duplicateSegmentIds.length === 1 ? "" : "s"
          }`
        );
      }

      ui.showStatus(
        `Segment ID warning: ${issues.join(", ")}.`,
        6000
      );
    }
  }

  const counties = uniqueValues(features, "County");
  const regions = uniqueValues(features, "Region");

  ui.populateSelect("county", counties);
  ui.populateSelect("region", regions);

  if (counties.includes(previousCounty)) $("county").value = previousCounty;
  if (regions.includes(previousRegion)) $("region").value = previousRegion;

  renderAll();
}

async function refreshTrailData({
  showLoadError = false,
  showQaWarning = false
} = {}) {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const freshFeatures = await fetchTrailFeatures();
      lastNetworkRefresh = Date.now();

      await writeCachedTrailFeatures(freshFeatures);

      if (!sameTrailSnapshot(features, freshFeatures)) {
        applyTrailFeatures(freshFeatures, { showQaWarning });
      }
    } catch (error) {
      console.warn("Could not refresh Ridge Trail data", error);

      if (showLoadError && features.length === 0) {
        const message =
          error instanceof Error ? error.message : "Please try again.";

        ui.renderLoadError(message);
        ui.showStatus("Could not load Ridge Trail data.", 5000);
      }
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

function initializeBackgroundRefresh() {
  window.addEventListener("online", () => {
    refreshTrailData({ showLoadError: features.length === 0 });
  });

  document.addEventListener("visibilitychange", () => {
    const fiveMinutes = 5 * 60 * 1000;

    if (
      document.visibilityState === "visible" &&
      Date.now() - lastNetworkRefresh > fiveMinutes
    ) {
      refreshTrailData({ showLoadError: features.length === 0 });
    }
  });
}

async function initialize() {
  initializeMobilePanelToggle();

  ui = createUI({
    progressStore,
    onSelect: selectFeature,
    onToggleComplete: toggleComplete,
    onFiltersChange: handleFiltersChange,
    onCloseDetails: clearSelection,
    onHome: goHome,
    onReset: resetProgress,
    onLocate: () =>
      ridgeMap.locate({
        onError: (message) => ui.showStatus(message)
      })
  });

  ridgeMap = createRidgeMap({
    onSelect: selectFeature,
    onBlankMapClick: () => {
      if (selectedObjectId != null) clearSelection();
    },
    isDone: (properties) => progressStore.isDone(properties)
  });

  const cachedFeatures = await readCachedTrailFeatures();

  if (cachedFeatures?.length) {
    applyTrailFeatures(cachedFeatures);
  }

  await refreshTrailData({
    showLoadError: true,
    showQaWarning: true
  });

  initializeBackgroundRefresh();
}

registerServiceWorker();
initialize();
