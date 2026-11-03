import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../workout/gps_point.dart';
import '../theme.dart';

const _darkTiles = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
const _osmTiles = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const _dushanbe = LatLng(38.5598, 68.787);

const _resultGradient = [
  Color(0xFFFF2D55),
  Color(0xFFFF6B2D),
  Color(0xFFFFCC00),
  Color(0xFFC3F400),
  Color(0xFF00E5BC),
  Color(0xFF00D4FF),
];

/// Кнопки +/− на экране тренировки управляют картой через этот контроллер.
class WorkoutMapController {
  void Function(double delta)? _zoom;
  void zoom(double delta) => _zoom?.call(delta);
}

List<LatLng> _track(List<GpsPoint> points, GpsPoint? live, {bool includeLive = true}) {
  final out = <LatLng>[];
  void push(double lat, double lng) {
    if (!lat.isFinite || !lng.isFinite || lat.abs() > 90 || lng.abs() > 180) return;
    if (out.isNotEmpty && (out.last.latitude - lat).abs() < 1e-7 && (out.last.longitude - lng).abs() < 1e-7) return;
    out.add(LatLng(lat, lng));
  }

  for (final p in points) {
    push(p.latitude, p.longitude);
  }
  if (includeLive && live != null) push(live.latitude, live.longitude);
  return out;
}

String _routeKey(List<LatLng> c) => c.isEmpty
    ? ''
    : '${c.length}:${c.first.latitude.toStringAsFixed(5)},${c.first.longitude.toStringAsFixed(5)}:'
        '${c.last.latitude.toStringAsFixed(5)},${c.last.longitude.toStringAsFixed(5)}';

/// Карта маршрута. iOS — нативный MapKit, Android — OSM.
/// [follow] — следовать за пользователем (живая тренировка), иначе показать весь маршрут.
/// [gradient] — раскраска маршрута от старта к финишу (экран результата).
class WorkoutMap extends StatelessWidget {
  const WorkoutMap({
    super.key,
    required this.points,
    this.livePosition,
    this.follow = true,
    this.gradient = false,
    this.controller,
  });

  final List<GpsPoint> points;
  final GpsPoint? livePosition;
  final bool follow;
  final bool gradient;
  final WorkoutMapController? controller;

  @override
  Widget build(BuildContext context) {
    final coords = _track(points, livePosition, includeLive: !gradient);
    final map = Platform.isIOS
        ? _AppleMap(coords: coords, follow: follow, controller: controller)
        : _OsmMap(coords: coords, follow: follow, gradient: gradient, controller: controller, hasTrack: points.isNotEmpty);
    return ClipRRect(
      borderRadius: BorderRadius.zero,
      child: Stack(
        fit: StackFit.expand,
        children: [
          const ColoredBox(color: RB.surfaceLow),
          map,
          if (coords.isEmpty && follow)
            IgnorePointer(
              child: Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(color: Colors.black54, borderRadius: BorderRadius.circular(999)),
                  child: Text('GPS ожидает сигнал…', style: RB.body(size: 13, color: RB.onSurfaceVariant)),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _AppleMap extends StatefulWidget {
  const _AppleMap({required this.coords, required this.follow, this.controller});
  final List<LatLng> coords;
  final bool follow;
  final WorkoutMapController? controller;

  @override
  State<_AppleMap> createState() => _AppleMapState();
}

class _AppleMapState extends State<_AppleMap> {
  MethodChannel? _channel;
  String _lastKey = '';

  List<double> get _flat => [for (final c in widget.coords) ...[c.latitude, c.longitude]];

  @override
  void initState() {
    super.initState();
    widget.controller?._zoom = (d) => _channel?.invokeMethod('zoom', {'delta': d});
    _lastKey = _routeKey(widget.coords);
  }

  @override
  void didUpdateWidget(_AppleMap old) {
    super.didUpdateWidget(old);
    widget.controller?._zoom = (d) => _channel?.invokeMethod('zoom', {'delta': d});
    if (old.follow != widget.follow) {
      _channel?.invokeMethod('setFollowUser', {'follow': widget.follow});
    }
    final key = _routeKey(widget.coords);
    if (key != _lastKey) {
      _lastKey = key;
      _channel?.invokeMethod('setRoute', {'coords': _flat, 'fit': !widget.follow});
    }
  }

  @override
  Widget build(BuildContext context) {
    return UiKitView(
      viewType: 'runbonus/apple_map',
      creationParams: {'followUser': widget.follow, 'coords': _flat},
      creationParamsCodec: const StandardMessageCodec(),
      gestureRecognizers: {Factory<EagerGestureRecognizer>(() => EagerGestureRecognizer())},
      onPlatformViewCreated: (id) {
        _channel = MethodChannel('runbonus/apple_map_$id')
          ..invokeMethod('setRoute', {'coords': _flat, 'fit': !widget.follow});
      },
    );
  }
}

class _OsmMap extends StatefulWidget {
  const _OsmMap({required this.coords, required this.follow, required this.gradient, required this.hasTrack, this.controller});
  final List<LatLng> coords;
  final bool follow;
  final bool gradient;
  final bool hasTrack;
  final WorkoutMapController? controller;

  @override
  State<_OsmMap> createState() => _OsmMapState();
}

class _OsmMapState extends State<_OsmMap> {
  final _map = MapController();
  bool _ready = false;
  bool _fitted = false;
  bool _useOsm = false;
  int _tileErrors = 0;

  @override
  void initState() {
    super.initState();
    widget.controller?._zoom = _zoom;
  }

  void _zoom(double delta) {
    if (!_ready) return;
    final cam = _map.camera;
    _map.move(cam.center, (cam.zoom + delta).clamp(3, 19));
  }

  void _syncCamera() {
    if (!_ready || widget.coords.isEmpty) return;
    if (widget.follow) {
      final last = widget.coords.last;
      if (!_fitted) {
        _map.move(last, 16);
        _fitted = true;
      } else {
        _map.move(last, _map.camera.zoom);
      }
    } else if (!_fitted) {
      _fitted = true;
      if (widget.coords.length == 1) {
        _map.move(widget.coords.first, 15);
      } else {
        _map.fitCamera(CameraFit.coordinates(
          coordinates: widget.coords,
          padding: const EdgeInsets.all(48),
          maxZoom: 16,
        ));
      }
    }
  }

  @override
  void didUpdateWidget(_OsmMap old) {
    super.didUpdateWidget(old);
    widget.controller?._zoom = _zoom;
    if (_routeKey(old.coords) != _routeKey(widget.coords)) {
      if (!widget.follow && old.coords.isEmpty) _fitted = false;
      WidgetsBinding.instance.addPostFrameCallback((_) => _syncCamera());
    }
  }

  List<Polyline> _polylines() {
    final c = widget.coords;
    if (c.length < 2) return const [];
    if (!widget.gradient) return [Polyline(points: c, color: RB.neon, strokeWidth: 4)];
    final step = math.max(1, c.length ~/ 40);
    final out = <Polyline>[];
    for (var i = 0; i < c.length - 1; i += step) {
      final j = math.min(c.length - 1, i + step);
      final t = i / (c.length - 1);
      final color = _resultGradient[math.min(_resultGradient.length - 1, (t * (_resultGradient.length - 1)).floor())];
      out.add(Polyline(points: c.sublist(i, j + 1), color: color, strokeWidth: 5, strokeCap: StrokeCap.round));
    }
    return out;
  }

  List<CircleMarker> _markers() {
    final c = widget.coords;
    if (c.isEmpty) return const [];
    if (widget.gradient) {
      return [
        CircleMarker(point: c.first, radius: 8, color: const Color(0xFFFF2D55), borderColor: Colors.white, borderStrokeWidth: 3),
        CircleMarker(point: c.last, radius: 10, color: const Color(0xFF111111), borderColor: RB.neon, borderStrokeWidth: 3),
      ];
    }
    return [
      CircleMarker(
        point: c.last,
        radius: widget.hasTrack ? 7 : 8,
        color: widget.hasTrack ? RB.neon : const Color(0xE600D4FF),
        borderColor: RB.bg,
        borderStrokeWidth: 2,
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    return FlutterMap(
      mapController: _map,
      options: MapOptions(
        initialCenter: widget.coords.isNotEmpty ? widget.coords.last : _dushanbe,
        initialZoom: 15,
        backgroundColor: RB.surfaceLow,
        interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
        onMapReady: () {
          _ready = true;
          _syncCamera();
        },
      ),
      children: [
        TileLayer(
          urlTemplate: _useOsm ? _osmTiles : _darkTiles,
          maxNativeZoom: _useOsm ? 19 : 16,
          userAgentPackageName: 'com.runbonus.app',
          errorTileCallback: (_, _, _) {
            if (_useOsm) return;
            _tileErrors++;
            if (_tileErrors >= 2) {
              WidgetsBinding.instance.addPostFrameCallback((_) {
                if (mounted) setState(() => _useOsm = true);
              });
            }
          },
        ),
        PolylineLayer(polylines: _polylines()),
        CircleLayer(circles: _markers()),
      ],
    );
  }
}
