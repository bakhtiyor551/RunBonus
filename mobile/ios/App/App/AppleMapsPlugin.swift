import Foundation
import Capacitor
import MapKit
import UIKit
import CoreLocation

@objc(AppleMapsPlugin)
public class AppleMapsPlugin: CAPPlugin, MKMapViewDelegate {
    private var mapView: MKMapView?
    private var routeCoords: [CLLocationCoordinate2D] = []
    private var followUser = true
    private var userInteracting = false
    private var resumeFollowWorkItem: DispatchWorkItem?
    private let routeId = "rb_workout_route"

    @objc func create(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let bridge = self.bridge,
                  let webView = bridge.webView,
                  let parent = webView.superview else {
                call.reject("WebView unavailable")
                return
            }

            let x = CGFloat(call.getDouble("x") ?? 0)
            let y = CGFloat(call.getDouble("y") ?? 0)
            let w = CGFloat(call.getDouble("width") ?? 0)
            let h = CGFloat(call.getDouble("height") ?? 0)
            guard w > 1, h > 1 else {
                call.reject("Invalid map frame")
                return
            }

            self.destroyMapView()

            let map = MKMapView(frame: .zero)
            map.delegate = self
            map.mapType = .standard
            map.isRotateEnabled = true
            map.isPitchEnabled = false
            map.showsCompass = true
            map.showsScale = true
            map.showsUserLocation = true
            map.userTrackingMode = .follow
            map.isZoomEnabled = true
            map.isScrollEnabled = true
            map.layer.masksToBounds = true
            // Neon route style contrast on light Apple Maps
            map.overrideUserInterfaceStyle = .light

            let frameInWeb = CGRect(x: x, y: y, width: w, height: h)
            map.frame = webView.convert(frameInWeb, to: parent)
            parent.insertSubview(map, aboveSubview: webView)
            self.mapView = map
            self.followUser = call.getBool("followUser") ?? true
            self.userInteracting = false
            self.applyFollowMode()

            if let points = call.getArray("points", JSObject.self) {
                self.applyRoute(from: points, fit: true)
            }

            call.resolve(["ok": true])
        }
    }

    @objc func setFrame(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let map = self.mapView,
                  let webView = self.bridge?.webView,
                  let parent = webView.superview else {
                call.resolve(["ok": false])
                return
            }
            let x = CGFloat(call.getDouble("x") ?? 0)
            let y = CGFloat(call.getDouble("y") ?? 0)
            let w = CGFloat(call.getDouble("width") ?? 0)
            let h = CGFloat(call.getDouble("height") ?? 0)
            guard w > 1, h > 1 else {
                call.resolve(["ok": false])
                return
            }
            let frameInWeb = CGRect(x: x, y: y, width: w, height: h)
            map.frame = webView.convert(frameInWeb, to: parent)
            call.resolve(["ok": true])
        }
    }

    @objc func setRoute(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let points = call.getArray("points", JSObject.self) ?? []
            let fit = call.getBool("fit") ?? false
            self.applyRoute(from: points, fit: fit)
            call.resolve(["ok": true, "count": points.count])
        }
    }

    @objc func setFollowUser(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.followUser = call.getBool("follow") ?? true
            self.userInteracting = false
            self.applyFollowMode()
            call.resolve(["ok": true])
        }
    }

    @objc func setVisible(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let visible = call.getBool("visible") ?? true
            self.mapView?.isHidden = !visible
            call.resolve(["ok": true])
        }
    }

    @objc func destroy(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.destroyMapView()
            call.resolve(["ok": true])
        }
    }

    private func destroyMapView() {
        resumeFollowWorkItem?.cancel()
        resumeFollowWorkItem = nil
        mapView?.removeFromSuperview()
        mapView?.delegate = nil
        mapView = nil
        routeCoords = []
        followUser = true
        userInteracting = false
    }

    private func applyFollowMode() {
        guard let map = mapView else { return }
        if followUser && !userInteracting {
            map.userTrackingMode = .follow
        } else {
            map.userTrackingMode = .none
        }
    }

    private func applyRoute(from points: [JSObject], fit: Bool) {
        guard let map = mapView else { return }

        var coords: [CLLocationCoordinate2D] = []
        coords.reserveCapacity(points.count)
        for p in points {
            let lat = (p["latitude"] as? Double) ?? (p["lat"] as? Double)
            let lng = (p["longitude"] as? Double) ?? (p["lng"] as? Double) ?? (p["lon"] as? Double)
            guard let lat, let lng, lat.isFinite, lng.isFinite else { continue }
            coords.append(CLLocationCoordinate2D(latitude: lat, longitude: lng))
        }

        let oldOverlays = map.overlays.filter { ($0 as? MKPolyline)?.title == routeId }
        map.removeOverlays(oldOverlays)

        routeCoords = coords
        guard coords.count >= 2 else {
            if let last = coords.last, followUser && !userInteracting {
                map.setCenter(last, animated: true)
            }
            return
        }

        let poly = MKPolyline(coordinates: &coords, count: coords.count)
        poly.title = routeId
        map.addOverlay(poly, level: .aboveRoads)

        if fit && !followUser {
            let rect = poly.boundingMapRect
            map.setVisibleMapRect(rect, edgePadding: UIEdgeInsets(top: 40, left: 28, bottom: 40, right: 28), animated: true)
        } else if followUser && !userInteracting, let last = coords.last {
            map.setCenter(last, animated: true)
        }
    }

    // MARK: - MKMapViewDelegate

    public func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
        if let poly = overlay as? MKPolyline {
            let r = MKPolylineRenderer(polyline: poly)
            r.strokeColor = UIColor(red: 0.765, green: 0.957, blue: 0.0, alpha: 0.95) // #c3f400
            r.lineWidth = 5
            r.lineCap = .round
            r.lineJoin = .round
            return r
        }
        return MKOverlayRenderer(overlay: overlay)
    }

    public func mapView(_ mapView: MKMapView, regionWillChangeAnimated animated: Bool) {
        // Пользователь двигает карту — временно отключаем follow
        if mapView.isUserInteractionEnabled {
            let gestureActive = (mapView.gestureRecognizers ?? []).contains {
                $0.state == .began || $0.state == .changed
            }
            // Также gesture на внутренних view MapKit
            var nestedActive = false
            for sub in mapView.subviews {
                if (sub.gestureRecognizers ?? []).contains(where: { $0.state == .began || $0.state == .changed }) {
                    nestedActive = true
                    break
                }
            }
            if gestureActive || nestedActive {
                userInteracting = true
                mapView.userTrackingMode = .none
                scheduleResumeFollow()
            }
        }
    }

    public func mapViewDidChangeVisibleRegion(_ mapView: MKMapView) {
        // keep
    }

    private func scheduleResumeFollow() {
        resumeFollowWorkItem?.cancel()
        guard followUser else { return }
        let work = DispatchWorkItem { [weak self] in
            guard let self = self else { return }
            self.userInteracting = false
            self.applyFollowMode()
        }
        resumeFollowWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 8, execute: work)
    }
}
