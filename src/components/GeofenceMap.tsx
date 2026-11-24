import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { GeofenceZone, GPSReading } from '../types/hr';

interface GeofenceMapProps {
  zones: GeofenceZone[];
  userLocation?: GPSReading | null;
  isInsideZone?: boolean;
  selectedZoneId?: string | null;
  draftPin?: { latitude: number; longitude: number; radiusMeters: number; name?: string } | null;
  interactivePinDrop?: boolean;
  onMapClick?: (lat: number, lng: number) => void;
  heightClass?: string;
}

function createPinIcon(color: string, pulseRing = false): L.DivIcon {
  const html = `
    <div style="position:relative;width:28px;height:28px;display:flex;align-items:center;justify-content:center;">
      ${
        pulseRing
          ? `<span style="position:absolute;inset:0;border-radius:9999px;background:${color};opacity:0.22;"></span>`
          : ''
      }
      <span style="width:14px;height:14px;border-radius:9999px;background:${color};border:2.5px solid #ffffff;box-shadow:0 2px 6px rgba(15,23,42,0.35);"></span>
    </div>
  `;
  return L.divIcon({
    className: 'masar-custom-pin',
    html,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

export const GeofenceMap: React.FC<GeofenceMapProps> = ({
  zones,
  userLocation,
  isInsideZone = false,
  selectedZoneId,
  draftPin,
  interactivePinDrop = false,
  onMapClick,
  heightClass = 'h-72',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const onMapClickRef = useRef(onMapClick);
  const hasFittedInitialRef = useRef(false);

  onMapClickRef.current = onMapClick;

  // Mount Leaflet map once
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const initialCenter: [number, number] = userLocation
      ? [userLocation.latitude, userLocation.longitude]
      : zones[0]
        ? [zones[0].latitude, zones[0].longitude]
        : [25.2116, 55.2808];

    const map = L.map(container, {
      center: initialCenter,
      zoom: 15,
      zoomControl: true,
      scrollWheelZoom: true,
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    const handleClick = (e: L.LeafletMouseEvent) => {
      if (onMapClickRef.current) {
        onMapClickRef.current(
          Number(e.latlng.lat.toFixed(6)),
          Number(e.latlng.lng.toFixed(6))
        );
      }
    };

    map.on('click', handleClick);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        if (mapRef.current) {
          mapRef.current.invalidateSize({ animate: false });
        }
      });
      observer.observe(container);
    }

    const resizeTimer = window.setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize({ animate: false });
      }
    }, 120);

    return () => {
      window.clearTimeout(resizeTimer);
      observer?.disconnect();
      map.stop();
      map.off('click', handleClick);
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
      hasFittedInitialRef.current = false;
    };
  }, []);

  // Re-draw zones, user marker, and draft pin whenever props change
  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    const boundsPoints: L.LatLngExpression[] = [];

    zones.forEach((zone) => {
      const isSelected = zone.id === selectedZoneId;
      const strokeColor = !zone.active ? '#94a3b8' : isSelected ? '#3730a3' : '#4f46e5';

      const circle = L.circle([zone.latitude, zone.longitude], {
        radius: zone.radiusMeters,
        color: strokeColor,
        weight: isSelected ? 2.5 : 1.75,
        fillColor: strokeColor,
        fillOpacity: isSelected ? 0.2 : 0.12,
      });
      circle.bindPopup(
        `<div style="font-size:12px;line-height:1.4"><strong>${zone.name}</strong><br/>Radius: ${zone.radiusMeters}m<br/><span style="color:#64748b">${zone.address}</span></div>`
      );
      circle.addTo(group);

      const marker = L.marker([zone.latitude, zone.longitude], {
        icon: createPinIcon(strokeColor, false),
      });
      marker.bindTooltip(zone.name, { direction: 'top', offset: [0, -10] });
      marker.addTo(group);

      boundsPoints.push([zone.latitude, zone.longitude]);
    });

    if (draftPin) {
      L.circle([draftPin.latitude, draftPin.longitude], {
        radius: draftPin.radiusMeters,
        color: '#059669',
        weight: 2,
        dashArray: '6 4',
        fillColor: '#10b981',
        fillOpacity: 0.18,
      }).addTo(group);

      L.marker([draftPin.latitude, draftPin.longitude], {
        icon: createPinIcon('#059669', true),
      })
        .bindTooltip(draftPin.name || `New Zone (${draftPin.radiusMeters}m)`, {
          direction: 'top',
          offset: [0, -10],
        })
        .addTo(group);

      boundsPoints.push([draftPin.latitude, draftPin.longitude]);
    }

    if (userLocation) {
      const markerColor = isInsideZone ? '#059669' : '#e11d48';
      const userMarker = L.marker([userLocation.latitude, userLocation.longitude], {
        icon: createPinIcon(markerColor, true),
      });
      userMarker.bindPopup(
        `<div style="font-size:12px;line-height:1.4"><strong>Your Location${userLocation.isSimulated ? ' (Simulated)' : ''}</strong><br/>${userLocation.latitude.toFixed(5)}, ${userLocation.longitude.toFixed(5)}<br/>Accuracy: &plusmn;${Math.round(userLocation.accuracyMeters)}m</div>`
      );
      userMarker.addTo(group);

      if (userLocation.accuracyMeters > 0 && userLocation.accuracyMeters <= 600) {
        L.circle([userLocation.latitude, userLocation.longitude], {
          radius: userLocation.accuracyMeters,
          color: markerColor,
          weight: 1,
          dashArray: '3 4',
          fillColor: markerColor,
          fillOpacity: 0.06,
        }).addTo(group);
      }
      boundsPoints.push([userLocation.latitude, userLocation.longitude]);
    }

    // Center immediately without deferred zoom transitions that can race component unmount
    if (draftPin && interactivePinDrop) {
      map.panTo([draftPin.latitude, draftPin.longitude], { animate: false });
    } else if (selectedZoneId) {
      const selected = zones.find((z) => z.id === selectedZoneId);
      if (selected) {
        map.setView([selected.latitude, selected.longitude], 16, { animate: false });
      }
    } else if (userLocation) {
      map.setView([userLocation.latitude, userLocation.longitude], 16, { animate: false });
    } else if (!hasFittedInitialRef.current && boundsPoints.length > 0) {
      if (boundsPoints.length === 1) {
        map.setView(boundsPoints[0], 16, { animate: false });
      } else {
        map.fitBounds(L.latLngBounds(boundsPoints), {
          padding: [36, 36],
          maxZoom: 15,
          animate: false,
        });
      }
      hasFittedInitialRef.current = true;
    }

    map.invalidateSize({ animate: false });
  }, [zones, userLocation, isInsideZone, selectedZoneId, draftPin, interactivePinDrop]);

  return (
    <div
      className={`relative w-full ${heightClass} rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900`}
      data-testid="geofence-map"
    >
      <div
        ref={containerRef}
        className={`w-full h-full ${interactivePinDrop ? 'cursor-crosshair' : ''}`}
      />
      {interactivePinDrop && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-20 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-xs">
          Click anywhere on the map to position the geofence pin
        </div>
      )}
    </div>
  );
};
