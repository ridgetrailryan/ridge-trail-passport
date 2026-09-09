const TYPE_LABELS = {
  Primary: "Primary Trail",
  Restricted: "Primary Trail with Restricted Access",
  Connector: "Connector Trail",
  Spur: "Spur Trail",
  Parallel: "Parallel Trail"
};

const SIDE_TRAIL_TYPES = new Set(["Connector", "Spur", "Parallel"]);

export function milesFor(properties = {}) {
  const miles = Number(properties.Calculated_Mileage ?? 0);
  return Number.isFinite(miles) && miles >= 0 ? miles : 0;
}

export function trailTypeCode(properties = {}) {
  return String(properties.Trail_Type || "").trim();
}

export function isRestricted(properties) {
  return trailTypeCode(properties) === "Restricted";
}

export function isPrimary(properties) {
  return trailTypeCode(properties) === "Primary";
}

export function isCompletionEligible(properties) {
  return isPrimary(properties) || isRestricted(properties);
}

export function isSideTrail(properties) {
  return SIDE_TRAIL_TYPES.has(trailTypeCode(properties));
}

export function trailTypeLabel(properties = {}) {
  const type = trailTypeCode(properties);
  return TYPE_LABELS[type] || type || "Trail";
}

function toLatLng(coordinate) {
  if (!Array.isArray(coordinate) || coordinate.length < 2) return null;

  const longitude = Number(coordinate[0]);
  const latitude = Number(coordinate[1]);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return [latitude, longitude];
}

export function getFeatureEndpoints(feature) {
  const geometry = feature?.geometry;
  if (!geometry) return null;

  let startCoordinate = null;
  let endCoordinate = null;

  if (
    geometry.type === "LineString" &&
    Array.isArray(geometry.coordinates) &&
    geometry.coordinates.length >= 2
  ) {
    startCoordinate = geometry.coordinates[0];
    endCoordinate = geometry.coordinates[geometry.coordinates.length - 1];
  } else if (
    geometry.type === "MultiLineString" &&
    Array.isArray(geometry.coordinates)
  ) {
    const parts = geometry.coordinates.filter(
      (part) => Array.isArray(part) && part.length >= 2
    );

    if (!parts.length) return null;

    startCoordinate = parts[0][0];
    const lastPart = parts[parts.length - 1];
    endCoordinate = lastPart[lastPart.length - 1];
  }

  const start = toLatLng(startCoordinate);
  const end = toLatLng(endCoordinate);

  return start && end ? { start, end } : null;
}
