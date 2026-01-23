## Preset 1: Streets:
[
  { "featureType": "all", "elementType": "labels", "stylers": [{ "visibility": "off" }] },

  { "featureType": "poi", "stylers": [{ "visibility": "off" }] },
  { "featureType": "transit", "stylers": [{ "visibility": "off" }] },
  { "featureType": "administrative", "stylers": [{ "visibility": "off" }] },

  { "featureType": "landscape", "elementType": "geometry", "stylers": [{ "color": "#FFFEF2" }] },
  { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#FFFEF2" }] },

  { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#000000" }, { "visibility": "on" }] },
  { "featureType": "road", "elementType": "geometry.stroke", "stylers": [{ "visibility": "off" }] }
]
## Preset 2: Ultra Minimal:
[
  { "featureType": "all", "elementType": "labels", "stylers": [{ "visibility": "off" }] },
  { "featureType": "poi", "stylers": [{ "visibility": "off" }] },
  { "featureType": "transit", "stylers": [{ "visibility": "off" }] },
  { "featureType": "administrative", "stylers": [{ "visibility": "off" }] },

  { "featureType": "landscape", "elementType": "geometry", "stylers": [{ "color": "#FFFEF2" }] },
  { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#FFFEF2" }] },

  { "featureType": "road", "elementType": "geometry.fill", "stylers": [{ "visibility": "off" }] },
  { "featureType": "road", "elementType": "geometry.stroke", "stylers": [{ "visibility": "off" }] },

  { "featureType": "road.highway", "elementType": "geometry.stroke", "stylers": [{ "visibility": "on" }, { "color": "#000000" }, { "weight": 2.0 }] },
  { "featureType": "road.arterial", "elementType": "geometry.stroke", "stylers": [{ "visibility": "on" }, { "color": "#000000" }, { "weight": 1.4 }] },
  { "featureType": "road.local", "elementType": "geometry.stroke", "stylers": [{ "visibility": "on" }, { "color": "#000000" }, { "weight": 0.9 }] }
]
## Preset 3: Context:
[
  { "featureType": "all", "elementType": "labels", "stylers": [{ "visibility": "off" }] },
  { "featureType": "poi", "stylers": [{ "visibility": "off" }] },
  { "featureType": "transit", "stylers": [{ "visibility": "off" }] },

  { "featureType": "landscape", "elementType": "geometry", "stylers": [{ "color": "#FFFEF2" }] },
  { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#FFFEF2" }] },

  { "featureType": "road", "elementType": "geometry.fill", "stylers": [{ "visibility": "off" }] },
  { "featureType": "road", "elementType": "geometry.stroke", "stylers": [{ "visibility": "off" }] },
  { "featureType": "road.highway", "elementType": "geometry.stroke", "stylers": [{ "visibility": "on" }, { "color": "#000000" }, { "weight": 2.0 }] },
  { "featureType": "road.arterial", "elementType": "geometry.stroke", "stylers": [{ "visibility": "on" }, { "color": "#000000" }, { "weight": 1.4 }] },

  { "featureType": "administrative.locality", "elementType": "labels.text", "stylers": [{ "visibility": "on" }, { "color": "#000000" }] },
  { "featureType": "administrative.neighborhood", "elementType": "labels.text", "stylers": [{ "visibility": "on" }, { "color": "#000000" }] }
]
