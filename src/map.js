import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { CONFIG } from "./config.js";
import {
  getFeatureEndpoints,
  isCompletionEligible
} from "./trails.js";

export function createRidgeMap({ onSelect, onBlankMapClick, isDone }) {
  const map = L.map("map", {
    zoomControl: true,
    scrollWheelZoom: true,
    doubleClickZoom: true,
    dragging: true,
    touchZoom: true,
    boxZoom: true,
    keyboard: true
  }).setView(CONFIG.initialMap.center, CONFIG.initialMap.zoom);

  L.tileLayer(CONFIG.basemap.url, {
    maxZoom: CONFIG.basemap.maxZoom,
    attribution: CONFIG.basemap.attribution
  }).addTo(map);

  const prefersReducedMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || false;

  function refreshMapSize() {
    window.requestAnimationFrame(() => {
      map.invalidateSize({
        animate: false,
        pan: false,
        debounceMoveend: true
      });
    });
  }

  refreshMapSize();

  window.addEventListener(
    "load",
    () => {
      refreshMapSize();
      window.setTimeout(refreshMapSize, 200);
    },
    { once: true }
  );

  window.addEventListener("resize", refreshMapSize);
  window.visualViewport?.addEventListener("resize", refreshMapSize);

  if ("ResizeObserver" in window) {
    const mapResizeObserver = new ResizeObserver(refreshMapSize);
    mapResizeObserver.observe(map.getContainer());
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshMapSize();
  });

  const useLargeTouchTargets =
    window.matchMedia?.("(pointer: coarse)").matches ||
    navigator.maxTouchPoints > 0;

  const isMobileViewport = () =>
    window.matchMedia?.("(max-width: 800px)").matches;

  let geoLayer = null;
  let touchTargetLayer = null;
  let selectedHighlightLayer = null;
  let endpointLayer = null;
  let locationLayer = null;

  let currentFeatures = [];
  let currentSelectedId = null;

  function lineStyle(feature) {
    const properties = feature.properties;
    const done = isDone(properties);
    const selected = currentSelectedId === properties.OBJECTID;

    if (isCompletionEligible(properties)) {
      return {
        color: done ? CONFIG.colors.complete : CONFIG.colors.route,
        weight: selected ? 7 : done ? 4.5 : 3.5,
        opacity: selected ? 1 : 0.9,
        dashArray: null,
        lineCap: "round"
      };
    }

    return {
      color: CONFIG.colors.route,
      weight: selected ? 7 : 3.5,
      opacity: selected ? 1 : 0.88,
      dashArray: "10 8",
      lineCap: "round"
    };
  }

  function touchTargetStyle() {
    return {
      color: "#000000",
      weight: 18,
      opacity: 0.001,
      dashArray: null,
      lineCap: "round"
    };
  }

  function selectedHighlightStyle() {
    return {
      color: CONFIG.colors.selected,
      weight: 12.5,
      opacity: 0.95,
      dashArray: null,
      lineCap: "round"
    };
  }

  function endpointDividerSize() {
    const zoom = map.getZoom();

    if (zoom < 10) return 0;
    if (zoom < 14) return 7;
    return 9;
  }

  function endpointIcon(selected = false) {
    const size = endpointDividerSize();
    const className = `endpoint-marker${selected ? " selected" : ""}`;

    return L.divIcon({
      className: "",
      html: `<div class="${className}" style="width:${size}px;height:${size}px"></div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });
  }

  function removeLayer(layer) {
    if (layer) map.removeLayer(layer);
  }

  function clearDynamicLayers() {
    removeLayer(geoLayer);
    removeLayer(touchTargetLayer);
    removeLayer(selectedHighlightLayer);
    removeLayer(endpointLayer);

    geoLayer = null;
    touchTargetLayer = null;
    selectedHighlightLayer = null;
    endpointLayer = null;
  }

  function renderEndpoints() {
    removeLayer(endpointLayer);
    endpointLayer = null;

    if (endpointDividerSize() === 0) return;

    endpointLayer = L.layerGroup().addTo(map);

    currentFeatures
      .filter((feature) => isCompletionEligible(feature.properties))
      .forEach((feature) => {
        const endpoints = getFeatureEndpoints(feature);
        if (!endpoints) return;

        const selected =
          currentSelectedId === feature.properties.OBJECTID;

        for (const coordinate of [endpoints.start, endpoints.end]) {
          const marker = L.marker(coordinate, {
            icon: endpointIcon(selected),
            keyboard: false
          }).addTo(endpointLayer);

          marker.on("click", () => onSelect(feature, { fit: false }));
        }
      });
  }

  function render(features, selectedId) {
    currentFeatures = features;
    currentSelectedId = selectedId;

    clearDynamicLayers();

    const selectedFeatures = features.filter(
      (feature) => feature.properties.OBJECTID === selectedId
    );

    if (selectedFeatures.length) {
      selectedHighlightLayer = L.geoJSON(
        {
          type: "FeatureCollection",
          features: selectedFeatures
        },
        {
          style: selectedHighlightStyle,
          interactive: false
        }
      ).addTo(map);
    }

    geoLayer = L.geoJSON(
      {
        type: "FeatureCollection",
        features
      },
      {
        style: lineStyle,
        bubblingMouseEvents: false,
        onEachFeature(feature, layer) {
          layer.on("click", () => onSelect(feature, { fit: false }));
        }
      }
    ).addTo(map);

    if (useLargeTouchTargets) {
      touchTargetLayer = L.geoJSON(
        {
          type: "FeatureCollection",
          features
        },
        {
          style: touchTargetStyle,
          bubblingMouseEvents: false,
          onEachFeature(feature, layer) {
            layer.on("click", () => onSelect(feature, { fit: false }));
          }
        }
      ).addTo(map);
    }

    renderEndpoints();
  }

  function resetView() {
    removeLayer(locationLayer);
    locationLayer = null;

    map.setView(CONFIG.initialMap.center, CONFIG.initialMap.zoom, {
      animate: !prefersReducedMotion
    });
    refreshMapSize();
  }

  function fitToFeature(feature) {
    const bounds = L.geoJSON(feature).getBounds();

    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.25), {
        maxZoom: 13,
        animate: !prefersReducedMotion
      });
    }
  }

  function locate({ onError } = {}) {
    if (!navigator.geolocation) {
      onError?.("Location is not available in this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latLng = [
          position.coords.latitude,
          position.coords.longitude
        ];

        removeLayer(locationLayer);

        locationLayer = L.circleMarker(latLng, {
          radius: 7,
          color: "#1d2421",
          fillColor: "#ffffff",
          fillOpacity: 1,
          weight: 3
        }).addTo(map);

        map.setView(latLng, 12, {
          animate: !prefersReducedMotion
        });
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? "Location permission was not granted."
            : "Could not determine your location. Please try again.";

        onError?.(message);
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  }

  map.on("click", () => {
    if (isMobileViewport()) onBlankMapClick?.();
  });

  map.on("zoomend", renderEndpoints);

  return {
    map,
    render,
    resetView,
    fitToFeature,
    locate
  };
}
