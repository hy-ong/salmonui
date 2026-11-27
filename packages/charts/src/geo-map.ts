'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/charts/geo-map`: GeoMap
// with user-supplied GeoJSON layers, projections and a generic XYZ tile
// layer. Named `GeoMap` because `Map` shadows the JavaScript global. No geo
// data and no tile provider ship with the package.
export { GeoMap } from './geo-map/GeoMap.js';
export { GeoMapLayer } from './geo-map/model.js';
export type {
  GeoMapAnnotation, GeoMapApi, GeoMapChangeEvent, GeoMapChangeSource, GeoMapLegendOptions, GeoMapMarkerMove, GeoMapProps, GeoMapText, GeoMapTooltipContext, GeoMapView, GeoMapZoomOptions,
} from './geo-map/GeoMap.js';
export type {
  GeoMapBubbles, GeoMapClusterContext, GeoMapColorScale, GeoMapColorStop, GeoMapLabels, GeoMapMarkerContext, GeoMapMarkerShape, GeoMapMarkers, GeoMapPolygon,
  GeoMapRoute, GeoMapShapeContext, GeoMapStyle, GeoMapTiles, LatLon,
} from './geo-map/model.js';
export type { GeoFeature, GeoFeatureCollection, GeoGeometry, GeoJSON, ProjectionName as GeoMapProjection } from '#viz';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/charts/geo-map', 'salmon-geo-map');
