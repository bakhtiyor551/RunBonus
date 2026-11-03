import Foundation
import Capacitor
import MapKit
import UIKit
import CoreLocation

@objc(AppleMapsPlugin)
public class AppleMapsPlugin: CAPPlugin, MKMapViewDelegate {
    private var mapView: MKMapView?
    private var followUser = true
    private var userInteracting = false
    private var resumeFollowWorkItem: DispatchWorkItem?
    private let routeId = "rb_workout_route"
    private var startAnno: MKPointAnnotation?
    private var endAnno: MKPointAnnotation?

    @objc func create(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let bridge = self.bridge,
                  let webView = bridge.webView,
                  let parent = webView.superview else {
                call.reject("WebView unavailable")
                return
            }

            let frame = self.buildFrame(from: call, webView: webView)
            guard frame.width > 1, frame.height > 1 else {
                call.reject("Invalid map frame")
                return
            }

            self.destroyMapView()

            let follow = call.getBool("followUser") ?? true
            self.followUser = follow
            self.userInteracting = false

            let map = MKMapView(frame: frame)
            map.delegate = self
            map.mapType = .standard
            map.isRotateEnabled = false
            map.isPitchEnabled = false
            map.showsCompass = false
            map.showsScale = false
            map.showsUserLocation = follow
            map.userTrackingMode = follow ? .follow : .none
            map.isZoomEnabled = true
            map.isScrollEnabled = true
            map.isUserInteractionEnabled = true
            map.clipsToBounds = true
            map.layer.masksToBounds = true
            map.overrideUserInterfaceStyle = .light

            // Карта поверх WebView только в слоте; кнопки снизу вне frame
            parent.insertSubview(map, aboveSubview: webView)
            self.mapView = map

            NSLog("RunBonus AppleMaps create frame=%@", NSCoder.string(for: frame))

            let coords = self.parseCoordinates(from: call)
            self.applyRoute(coords, fit: !follow)
            call.resolve([
                "ok": true,
                "count": coords.count,
                "frame": [
                    "x": Double(frame.origin.x),
                    "y": Double(frame.origin.y),
                    "w": Double(frame.width),
                    "h": Double(frame.height),
                ],
            ])
        }
    }

    private func buildFrame(from call: CAPPluginCall, webView: UIView) -> CGRect {
        let x = CGFloat(call.getDouble("x") ?? 0)
        let y = CGFloat(call.getDouble("y") ?? 0)
        let w = CGFloat(call.getDouble("width") ?? webView.bounds.width)
        // Высота строго из JS-слота, без «срезания» до 40% экрана (из‑за этого был серый зазор)
        let h = min(max(CGFloat(call.getDouble("height") ?? 200), 120), 900)

        // getBoundingClientRect → координаты относительно WebView; origin WebView в parent
        return CGRect(
            x: webView.frame.origin.x + x,
            y: webView.frame.origin.y + y,
            width: max(1, w),
            height: h
        )
    }

    @objc func setFrame(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let map = self.mapView,
                  let webView = self.bridge?.webView else {
                call.resolve(["ok": false])
                return
            }
            let frame = self.buildFrame(from: call, webView: webView)
            guard frame.width > 1, frame.height > 1 else {
                call.resolve(["ok": false])
                return
            }
            map.frame = frame
            map.isZoomEnabled = true
            map.isScrollEnabled = true
            map.isUserInteractionEnabled = true
            call.resolve(["ok": true])
        }
    }

    @objc func setRoute(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let fit = call.getBool("fit") ?? false
            let coords = self.parseCoordinates(from: call)
            self.applyRoute(coords, fit: fit)
            call.resolve(["ok": true, "count": coords.count])
        }
    }

    @objc func setFollowUser(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.followUser = call.getBool("follow") ?? true
            self.userInteracting = false
            self.mapView?.showsUserLocation = self.followUser
            self.applyFollowMode()
            call.resolve(["ok": true])
        }
    }

    @objc func zoom(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let map = self.mapView else {
                call.resolve(["ok": false])
                return
            }
            let delta = call.getDouble("delta") ?? 1
            var region = map.region
            let factor = pow(0.5, delta)
            region.span.latitudeDelta = min(max(region.span.latitudeDelta * factor, 0.0004), 80)
            region.span.longitudeDelta = min(max(region.span.longitudeDelta * factor, 0.0004), 80)
            self.userInteracting = true
            map.userTrackingMode = .none
            map.setRegion(region, animated: true)
            self.resumeFollowWorkItem?.cancel()
            let work = DispatchWorkItem { [weak self] in
                self?.userInteracting = false
                self?.applyFollowMode()
            }
            self.resumeFollowWorkItem = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 8, execute: work)
            call.resolve(["ok": true])
        }
    }

    @objc func setVisible(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.mapView?.isHidden = !(call.getBool("visible") ?? true)
            call.resolve(["ok": true])
        }
    }

    @objc func destroy(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.destroyMapView()
            call.resolve(["ok": true])
        }
    }

    private func asDouble(_ value: Any?) -> Double? {
        if let d = value as? Double { return d }
        if let n = value as? NSNumber { return n.doubleValue }
        if let i = value as? Int { return Double(i) }
        if let f = value as? Float { return Double(f) }
        if let s = value as? String { return Double(s) }
        return nil
    }

    private func parseCoordinates(from call: CAPPluginCall) -> [CLLocationCoordinate2D] {
        if let anyFlat = call.getArray("coords") as? [Any], anyFlat.count >= 2 {
            var out: [CLLocationCoordinate2D] = []
            var i = 0
            while i + 1 < anyFlat.count {
                if let lat = asDouble(anyFlat[i]), let lng = asDouble(anyFlat[i + 1]),
                   lat.isFinite, lng.isFinite, abs(lat) <= 90, abs(lng) <= 180 {
                    out.append(CLLocationCoordinate2D(latitude: lat, longitude: lng))
                }
                i += 2
            }
            if !out.isEmpty { return dedupe(out) }
        }

        var out: [CLLocationCoordinate2D] = []
        if let points = call.getArray("points") as? [Any] {
            for item in points {
                guard let dict = item as? [String: Any] else { continue }
                let lat = asDouble(dict["latitude"]) ?? asDouble(dict["lat"])
                let lng = asDouble(dict["longitude"]) ?? asDouble(dict["lng"]) ?? asDouble(dict["lon"])
                guard let lat, let lng else { continue }
                out.append(CLLocationCoordinate2D(latitude: lat, longitude: lng))
            }
        }
        return dedupe(out)
    }

    private func dedupe(_ coords: [CLLocationCoordinate2D]) -> [CLLocationCoordinate2D] {
        guard !coords.isEmpty else { return coords }
        var result: [CLLocationCoordinate2D] = [coords[0]]
        for c in coords.dropFirst() {
            let p = result[result.count - 1]
            if abs(p.latitude - c.latitude) > 0.00001 || abs(p.longitude - c.longitude) > 0.00001 {
                result.append(c)
            }
        }
        return result
    }

    private func destroyMapView() {
        resumeFollowWorkItem?.cancel()
        resumeFollowWorkItem = nil
        if let map = mapView {
            map.removeAnnotations(map.annotations)
            map.removeOverlays(map.overlays)
            map.delegate = nil
            map.removeFromSuperview()
        }
        mapView = nil
        startAnno = nil
        endAnno = nil
        followUser = true
        userInteracting = false
    }

    private func applyFollowMode() {
        guard let map = mapView else { return }
        map.userTrackingMode = (followUser && !userInteracting) ? .follow : .none
    }

    private func applyRoute(_ coords: [CLLocationCoordinate2D], fit: Bool) {
        guard let map = mapView else { return }

        map.overlays.filter { ($0 as? MKPolyline)?.title == routeId }.forEach { map.removeOverlay($0) }
        if let s = startAnno { map.removeAnnotation(s); startAnno = nil }
        if let e = endAnno { map.removeAnnotation(e); endAnno = nil }

        guard !coords.isEmpty else { return }

        if coords.count >= 2 {
            let poly = coords.withUnsafeBufferPointer { buf in
                MKPolyline(coordinates: buf.baseAddress!, count: buf.count)
            }
            poly.title = routeId
            map.addOverlay(poly, level: .aboveRoads)

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
            fitTo(coords, on: map)
        } else if followUser && !userInteracting {
            map.setCenter(coords[coords.count - 1], animated: true)
        }
    }

    private func fitTo(_ coords: [CLLocationCoordinate2D], on map: MKMapView) {
        if coords.count == 1 {
            map.setRegion(
                MKCoordinateRegion(center: coords[0], latitudinalMeters: 400, longitudinalMeters: 400),
                animated: false
            )
            return
        }
        var rect = MKMapRect.null
        for c in coords {
            let p = MKMapPoint(c)
            rect = rect.union(MKMapRect(x: p.x, y: p.y, width: 0.1, height: 0.1))
        }
        map.setVisibleMapRect(
            rect,
            edgePadding: UIEdgeInsets(top: 36, left: 24, bottom: 36, right: 24),
            animated: false
        )
    }

    public func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
        if let poly = overlay as? MKPolyline {
            let r = MKPolylineRenderer(polyline: poly)
            r.strokeColor = UIColor(red: 0.765, green: 0.957, blue: 0.0, alpha: 0.98)
            r.lineWidth = 5.5
            r.lineCap = .round
            r.lineJoin = .round
            return r
        }
        return MKOverlayRenderer(overlay: overlay)
    }

    public func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
        if annotation is MKUserLocation { return nil }
        let id = "rb_pin"
        let view = (mapView.dequeueReusableAnnotationView(withIdentifier: id) as? MKMarkerAnnotationView)
            ?? MKMarkerAnnotationView(annotation: annotation, reuseIdentifier: id)
        view.annotation = annotation
        view.markerTintColor = annotation.title == "Старт"
            ? .systemRed
            : UIColor(red: 0.765, green: 0.957, blue: 0.0, alpha: 1)
        view.canShowCallout = false
        return view
    }

    public func mapView(_ mapView: MKMapView, regionWillChangeAnimated animated: Bool) {
        guard followUser else { return }
        let active = (mapView.gestureRecognizers ?? []).contains { $0.state == .began || $0.state == .changed }
            || mapView.subviews.contains { sub in
                (sub.gestureRecognizers ?? []).contains { $0.state == .began || $0.state == .changed }
            }
        if active {
            userInteracting = true
            mapView.userTrackingMode = .none
            resumeFollowWorkItem?.cancel()
            let work = DispatchWorkItem { [weak self] in
                self?.userInteracting = false
                self?.applyFollowMode()
            }
            resumeFollowWorkItem = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 8, execute: work)
        }
    }
}
