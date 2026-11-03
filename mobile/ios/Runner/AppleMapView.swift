import CoreLocation
import Flutter
import MapKit
import UIKit

final class AppleMapViewFactory: NSObject, FlutterPlatformViewFactory {
    private let messenger: FlutterBinaryMessenger

    init(messenger: FlutterBinaryMessenger) {
        self.messenger = messenger
        super.init()
    }

    func create(withFrame frame: CGRect, viewIdentifier viewId: Int64, arguments args: Any?) -> FlutterPlatformView {
        AppleMapView(frame: frame, viewId: viewId, args: args as? [String: Any] ?? [:], messenger: messenger)
    }

    func createArgsCodec() -> FlutterMessageCodec & NSObjectProtocol {
        FlutterStandardMessageCodec.sharedInstance()
    }
}

/// Карта тренировки на MapKit: неоновый маршрут, следование за пользователем,
/// после ручного жеста слежение возобновляется через 8 секунд.
final class AppleMapView: NSObject, FlutterPlatformView, MKMapViewDelegate {
    private static let neon = UIColor(red: 0.765, green: 0.957, blue: 0.0, alpha: 1)

    private let map: MKMapView
    private let channel: FlutterMethodChannel
    private var followUser: Bool
    private var userInteracting = false
    private var resumeFollowWorkItem: DispatchWorkItem?
    private var startAnno: MKPointAnnotation?
    private var endAnno: MKPointAnnotation?

    init(frame: CGRect, viewId: Int64, args: [String: Any], messenger: FlutterBinaryMessenger) {
        map = MKMapView(frame: frame)
        channel = FlutterMethodChannel(name: "runbonus/apple_map_\(viewId)", binaryMessenger: messenger)
        followUser = args["followUser"] as? Bool ?? true
        super.init()

        map.delegate = self
        map.mapType = .standard
        map.isRotateEnabled = false
        map.isPitchEnabled = false
        map.showsCompass = false
        map.showsScale = false
        map.showsUserLocation = followUser
        map.userTrackingMode = followUser ? .follow : .none
        map.overrideUserInterfaceStyle = .light

        channel.setMethodCallHandler { [weak self] call, result in
            self?.handle(call, result: result)
        }
        applyRoute(Self.parseCoordinates(args["coords"]), fit: !followUser)
    }

    deinit {
        resumeFollowWorkItem?.cancel()
        channel.setMethodCallHandler(nil)
        map.delegate = nil
    }

    func view() -> UIView { map }

    private func handle(_ call: FlutterMethodCall, result: FlutterResult) {
        let args = call.arguments as? [String: Any] ?? [:]
        switch call.method {
        case "setRoute":
            applyRoute(Self.parseCoordinates(args["coords"]), fit: args["fit"] as? Bool ?? false)
            result(["ok": true])
        case "setFollowUser":
            followUser = args["follow"] as? Bool ?? true
            userInteracting = false
            map.showsUserLocation = followUser
            applyFollowMode()
            result(["ok": true])
        case "zoom":
            let delta = (args["delta"] as? NSNumber)?.doubleValue ?? 1
            var region = map.region
            let factor = pow(0.5, delta)
            region.span.latitudeDelta = min(max(region.span.latitudeDelta * factor, 0.0004), 80)
            region.span.longitudeDelta = min(max(region.span.longitudeDelta * factor, 0.0004), 80)
            pauseFollowing()
            map.setRegion(region, animated: true)
            result(["ok": true])
        default:
            result(FlutterMethodNotImplemented)
        }
    }

    private static func parseCoordinates(_ raw: Any?) -> [CLLocationCoordinate2D] {
        guard let flat = raw as? [Any] else { return [] }
        var out: [CLLocationCoordinate2D] = []
        var i = 0
        while i + 1 < flat.count {
            if let lat = (flat[i] as? NSNumber)?.doubleValue, let lng = (flat[i + 1] as? NSNumber)?.doubleValue,
               lat.isFinite, lng.isFinite, abs(lat) <= 90, abs(lng) <= 180 {
                let c = CLLocationCoordinate2D(latitude: lat, longitude: lng)
                if let p = out.last, abs(p.latitude - lat) <= 0.00001, abs(p.longitude - lng) <= 0.00001 {
                    // дубль соседней точки
                } else {
                    out.append(c)
                }
            }
            i += 2
        }
        return out
    }

    private func pauseFollowing() {
        userInteracting = true
        map.userTrackingMode = .none
        resumeFollowWorkItem?.cancel()
        let work = DispatchWorkItem { [weak self] in
            self?.userInteracting = false
            self?.applyFollowMode()
        }
        resumeFollowWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 8, execute: work)
    }

    private func applyFollowMode() {
        map.userTrackingMode = (followUser && !userInteracting) ? .follow : .none
    }

    private func applyRoute(_ coords: [CLLocationCoordinate2D], fit: Bool) {
        map.removeOverlays(map.overlays)
        if let s = startAnno { map.removeAnnotation(s); startAnno = nil }
        if let e = endAnno { map.removeAnnotation(e); endAnno = nil }
        guard !coords.isEmpty else { return }

        if coords.count >= 2 {
            map.addOverlay(MKPolyline(coordinates: coords, count: coords.count), level: .aboveRoads)
            if !followUser {
                let start = MKPointAnnotation()
                start.coordinate = coords[0]
                start.title = "Старт"
                let end = MKPointAnnotation()
                end.coordinate = coords[coords.count - 1]
                end.title = "Финиш"
                map.addAnnotations([start, end])
                startAnno = start
                endAnno = end
            }
        }

        if fit {
            fitTo(coords)
        } else if followUser && !userInteracting {
            map.setCenter(coords[coords.count - 1], animated: true)
        }
    }

    private func fitTo(_ coords: [CLLocationCoordinate2D]) {
        if coords.count == 1 {
            map.setRegion(MKCoordinateRegion(center: coords[0], latitudinalMeters: 400, longitudinalMeters: 400), animated: false)
            return
        }
        var rect = MKMapRect.null
        for c in coords {
            let p = MKMapPoint(c)
            rect = rect.union(MKMapRect(x: p.x, y: p.y, width: 0.1, height: 0.1))
        }
        map.setVisibleMapRect(rect, edgePadding: UIEdgeInsets(top: 36, left: 24, bottom: 36, right: 24), animated: false)
    }

    func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
        guard let poly = overlay as? MKPolyline else { return MKOverlayRenderer(overlay: overlay) }
        let r = MKPolylineRenderer(polyline: poly)
        r.strokeColor = Self.neon.withAlphaComponent(0.98)
        r.lineWidth = 5.5
        r.lineCap = .round
        r.lineJoin = .round
        return r
    }

    func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
        if annotation is MKUserLocation { return nil }
        let id = "rb_pin"
        let view = (mapView.dequeueReusableAnnotationView(withIdentifier: id) as? MKMarkerAnnotationView)
            ?? MKMarkerAnnotationView(annotation: annotation, reuseIdentifier: id)
        view.annotation = annotation
        view.markerTintColor = annotation.title == "Старт" ? .systemRed : Self.neon
        view.canShowCallout = false
        return view
    }

    func mapView(_ mapView: MKMapView, regionWillChangeAnimated animated: Bool) {
        guard followUser else { return }
        let gestureActive: (UIView) -> Bool = { v in
            (v.gestureRecognizers ?? []).contains { $0.state == .began || $0.state == .changed }
        }
        if gestureActive(mapView) || mapView.subviews.contains(where: gestureActive) {
            pauseFollowing()
        }
    }
}
