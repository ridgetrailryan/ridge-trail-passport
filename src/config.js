export const CONFIG = {
  featureService:
    "https://services5.arcgis.com/6iLCtMhqIxD1wlgk/ArcGIS/rest/services/Bay_Area_Ridge_Trail_Official_Public_Route_Update/FeatureServer/0",

  // Keep this list limited to fields the app actually uses. Smaller responses
  // make startup faster and reduce the chance that unrelated schema changes
  // affect the Passport.
  featureFields: [
    "OBJECTID",
    "Segment_ID",
    "Section_Number",
    "Section_Name",
    "Trail_Type",
    "Calculated_Mileage",
    "Park_Managers",
    "Region",
    "County",
    "Segment_Name",
    "AllTrails_Link",
    "BRT_Website",
    "Partner_Website",
    "Dog_Permissions",
    "Bike_Permissions",
    "Horse_Permissions",
    "Restrooms",
    "Camping"
  ],

  requestTimeoutMs: 15000,

  basemap: {
    name: "OpenStreetMap",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
  },

  imageryBasemap: {
    name: "USGS Imagery Topo",
    url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}",
    maxNativeZoom: 16,
    maxZoom: 19,
    attribution:
      '<a href="https://www.usgs.gov/programs/national-geospatial-program/national-map" target="_blank" rel="noopener noreferrer">USGS The National Map</a>: Orthoimagery and US Topo'
  },

  initialMap: {
    center: [37.8, -122.15],
    zoom: 9
  },

  colors: {
    route: "#D44526",
    complete: "#2e6f4f",
    selected: "#ffffff"
  },

  storageKey: "ridgeTrailPassportProgress"
};
