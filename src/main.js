import "./styles.css";
import "./detail-photo.css";
import "./desktop.css";
import "./mobile-panel.css";

import { fetchTrailFeatures, uniqueValues, validateSegmentIds } from "./data.js";
import { createRidgeMap } from "./map.js";
import { createProgressStore } from "./progress.js";
import { createUI } from "./ui.js";
import { isCompletionEligible } from "./trails.js";
import { $ } from "./utils.js";

let features = [];
let selectedObjectId = null;

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

  try {
    features = await fetchTrailFeatures();

    const segmentIdQa = validateSegmentIds(features);
    progressStore.setInvalidSegmentIds(segmentIdQa.duplicateSegmentIds);

    if (!segmentIdQa.valid) {
      console.warn("Segment_ID QA warning", segmentIdQa);

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

    ui.populateSelect("county", uniqueValues(features, "County"));
    ui.populateSelect("region", uniqueValues(features, "Region"));

    renderAll();
  } catch (error) {
    console.error(error);

    const message =
      error instanceof Error ? error.message : "Please try again.";

    ui.renderLoadError(message);
    ui.showStatus("Could not load Ridge Trail data.", 5000);
  }
}

initialize();
