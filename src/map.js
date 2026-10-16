import { Map as MapLibreMap } from 'maplibre-gl';

// Old graphics drivers can lack WebGL2. Then the map shows a line in its place instead of taking the whole app down.
export function newMap(options) {
  try {
    return new MapLibreMap(options);
  } catch {
    options.container.innerHTML = '<p class="map-missing" role="alert">This map needs WebGL2 graphics, which this computer isn\'t offering. '
      + 'Updating the graphics driver usually fixes it. Everything else in Inkmap works.</p>';
    return null;
  }
}
