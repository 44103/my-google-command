/**
 * Google Maps operations using GAS Maps Service
 */

type RouteMode = "walking" | "driving" | "transit" | "bicycling";

type RouteLeg = {
  from: string;
  to: string;
  distance: string;
  duration: string;
};

type RouteResult = {
  from: string;
  to: string;
  waypoints: string[];
  mode: RouteMode;
  distance: string;
  duration: string;
  legs: RouteLeg[];
  polyline?: string;
  url?: string;
};

type GeocodeResult = {
  address: string;
  lat: number;
  lng: number;
  formattedAddress: string;
};

type RouteImageResult = {
  contentUrl: string;
  width: number;
  height: number;
  mimeType: string;
};

function parseRouteMode(mode?: string): RouteMode {
  if (!mode || mode === "walking") return "walking";
  if (mode === "driving" || mode === "transit" || mode === "bicycling") return mode;
  throw new Error(`Invalid mode: ${mode}. Must be walking, driving, transit, or bicycling`);
}

function getMapsDirectionMode(mode: RouteMode): GoogleAppsScript.Maps.Mode {
  switch (mode) {
    case "walking": return Maps.DirectionFinder.Mode.WALKING;
    case "driving": return Maps.DirectionFinder.Mode.DRIVING;
    case "transit": return Maps.DirectionFinder.Mode.TRANSIT;
    case "bicycling": return Maps.DirectionFinder.Mode.BICYCLING;
  }
}

function parseWaypoints(via?: string): string[] {
  if (!via || via.trim() === "") return [];
  // Support both pipe (|) and comma (,) as separators
  const separator = via.includes("|") ? "|" : ",";
  const waypoints = via.split(separator).map(w => w.trim()).filter(w => w.length > 0);
  if (waypoints.length > 8) {
    throw new Error("Maximum 8 waypoints allowed (Google Maps API limitation)");
  }
  return waypoints;
}

function getMapRoute(
  from: string,
  to: string,
  via?: string,
  mode?: string,
): RouteResult {
  if (!from || from.trim() === "") throw new Error("from is required");
  if (!to || to.trim() === "") throw new Error("to is required");

  const routeMode = parseRouteMode(mode);
  const waypoints = parseWaypoints(via);

  const finder = Maps.newDirectionFinder()
    .setOrigin(from)
    .setDestination(to)
    .setMode(getMapsDirectionMode(routeMode));

  for (const waypoint of waypoints) {
    finder.addWaypoint(waypoint);
  }

  const directions = finder.getDirections();

  if (directions.status !== "OK") {
    throw new Error(`Route not found: ${directions.status}`);
  }

  const route = directions.routes[0];
  const legs: RouteLeg[] = route.legs.map((leg: any, index: number) => {
    const legFrom = index === 0 ? from : waypoints[index - 1];
    const legTo = index === waypoints.length ? to : waypoints[index];
    return {
      from: legFrom,
      to: legTo,
      distance: leg.distance.text,
      duration: leg.duration.text,
    };
  });

  // Calculate total distance and duration
  let totalDistance = 0;
  let totalDuration = 0;
  for (const leg of route.legs) {
    totalDistance += (leg as any).distance.value;
    totalDuration += (leg as any).duration.value;
  }

  return {
    from,
    to,
    waypoints,
    mode: routeMode,
    distance: formatDistance(totalDistance),
    duration: formatDuration(totalDuration),
    legs,
    polyline: route.overview_polyline?.points,
    url: buildGoogleMapsUrl(from, to, waypoints, routeMode),
  };
}

function getMapRouteImage(
  from: string,
  to: string,
  via?: string,
  mode?: string,
  width?: number,
  height?: number,
): RouteImageResult {
  const route = getMapRoute(from, to, via, mode);

  if (!route.polyline) {
    throw new Error("Route polyline not available");
  }

  const mapWidth = width ?? 600;
  const mapHeight = height ?? 400;

  const staticMap = Maps.newStaticMap()
    .setSize(mapWidth, mapHeight);

  // Draw path with no fill (line only) - use 0x00000000 for transparent fill
  staticMap
    .setPathStyle(4, Maps.StaticMap.Color.BLUE as unknown as string, "0x00000000")
    .addPath(Maps.decodePolyline(route.polyline));

  // Add numbered markers: 1=start, 2..n=waypoints, n+1=end
  // Note: setMarkerStyle must be called before EACH addMarker for unique labels
  const markerSize = Maps.StaticMap.MarkerSize.MID as unknown as string;
  const markerColor = Maps.StaticMap.Color.RED as unknown as string;

  // Build all markers: start(1), waypoints(2..n), end(n+1)
  const allPoints: { location: string; label: string }[] = [];
  
  // Start point
  allPoints.push({ location: from, label: "1" });
  
  // Waypoints
  for (let i = 0; i < route.waypoints.length; i++) {
    allPoints.push({ location: route.waypoints[i], label: String(i + 2) });
  }
  
  // End point
  allPoints.push({ location: to, label: String(route.waypoints.length + 2) });

  // Add each marker with its own style setting
  for (const point of allPoints) {
    staticMap.setMarkerStyle(markerSize, markerColor, point.label);
    staticMap.addMarker(point.location);
  }

  const blob = staticMap.getBlob();
  const base64 = Utilities.base64Encode(blob.getBytes());

  return {
    contentUrl: `data:image/png;base64,${base64}`,
    width: mapWidth,
    height: mapHeight,
    mimeType: "image/png",
  };
}

function geocodeAddress(address: string): GeocodeResult {
  if (!address || address.trim() === "") throw new Error("address is required");

  const geocoder = Maps.newGeocoder();
  const result = geocoder.geocode(address);

  if (result.status !== "OK" || !result.results || result.results.length === 0) {
    throw new Error(`Geocode failed: ${result.status}`);
  }

  const location = result.results[0];
  return {
    address,
    lat: location.geometry.location.lat,
    lng: location.geometry.location.lng,
    formattedAddress: location.formatted_address,
  };
}

function reverseGeocode(lat: number, lng: number): GeocodeResult {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("lat and lng must be valid numbers");
  }

  const geocoder = Maps.newGeocoder();
  const result = geocoder.reverseGeocode(lat, lng);

  if (result.status !== "OK" || !result.results || result.results.length === 0) {
    throw new Error(`Reverse geocode failed: ${result.status}`);
  }

  const location = result.results[0];
  return {
    address: location.formatted_address,
    lat,
    lng,
    formattedAddress: location.formatted_address,
  };
}

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${meters} m`;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}時間${minutes}分`;
  }
  return `${minutes}分`;
}

function buildGoogleMapsUrl(from: string, to: string, waypoints: string[], mode: RouteMode): string {
  // Build Google Maps directions URL
  // Format: https://www.google.com/maps/dir/?api=1&origin=X&destination=Y&waypoints=A|B|C&travelmode=walking
  const baseUrl = "https://www.google.com/maps/dir/?api=1";
  const params: string[] = [];

  params.push(`origin=${encodeURIComponent(from)}`);
  params.push(`destination=${encodeURIComponent(to)}`);

  if (waypoints.length > 0) {
    params.push(`waypoints=${waypoints.map(w => encodeURIComponent(w)).join("|")}`);
  }

  params.push(`travelmode=${mode}`);

  return `${baseUrl}&${params.join("&")}`;
}
