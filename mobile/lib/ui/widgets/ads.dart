import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api.dart';
import '../../services/ads.dart';
import '../theme.dart';
import 'common.dart';

/// Блок рекламы страницы: партнёрский баннер RunBonus + Google Ads + Google Play.
class PageAdSlots extends StatelessWidget {
  const PageAdSlots({super.key, required this.page, this.city, this.partnerPlacement});
  final String page;
  final String? city;
  final String? partnerPlacement;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<bool>(
      valueListenable: AdsConfig.instance.googleAllowed,
      builder: (context, _, _) {
        final google = AdsConfig.instance.admobEnabled;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (partnerPlacement != null) PartnerBanner(placement: partnerPlacement!, city: city),
            if (google) ...[
              _AdMobSlot(network: 'google', page: page),
              const SizedBox(height: 16),
              _AdMobSlot(network: 'play', page: page),
            ],
          ],
        );
      },
    );
  }
}

class _AdMobSlot extends StatefulWidget {
  const _AdMobSlot({required this.network, required this.page});
  final String network;
  final String page;

  @override
  State<_AdMobSlot> createState() => _AdMobSlotState();
}

class _AdMobSlotState extends State<_AdMobSlot> {
  BannerAd? _ad;
  bool _loaded = false;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _ad = BannerAd(
      adUnitId: AdsConfig.instance.unitId(widget.network, widget.page),
      size: AdSize.banner,
      request: const AdRequest(),
      listener: BannerAdListener(
        onAdLoaded: (_) {
          if (mounted) setState(() => _loaded = true);
        },
        onAdFailedToLoad: (ad, _) {
          ad.dispose();
          _ad = null;
          if (mounted) setState(() => _failed = true);
        },
      ),
    )..load();
  }

  @override
  void dispose() {
    _ad?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_failed) return const SizedBox.shrink();
    final label = widget.network == 'google' ? 'Google Ads' : 'Google Play';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label.toUpperCase(), style: RB.label(size: 10)),
        const SizedBox(height: 6),
        Container(
          height: widget.network == 'play' ? 60 : 50,
          alignment: Alignment.center,
          decoration: RB.glass(radius: 12),
          child: _loaded && _ad != null
              ? SizedBox(width: _ad!.size.width.toDouble(), height: _ad!.size.height.toDouble(), child: AdWidget(ad: _ad!))
              : Text('Загрузка рекламы…', style: RB.body(size: 12, color: RB.onSurfaceVariant)),
        ),
      ],
    );
  }
}

/// Партнёрский баннер из админки RunBonus.
class PartnerBanner extends StatefulWidget {
  const PartnerBanner({super.key, required this.placement, this.city});
  final String placement;
  final String? city;

  @override
  State<PartnerBanner> createState() => _PartnerBannerState();
}

class _PartnerBannerState extends State<PartnerBanner> {
  Map<String, dynamic>? _banner;

  @override
  void initState() {
    super.initState();
    fetchAdBanners(widget.placement, city: widget.city).then((list) {
      if (!mounted || list.isEmpty) return;
      setState(() => _banner = list.first);
      trackAdEvent(list.first['id'], 'impression');
    });
  }

  void _open() {
    final b = _banner!;
    trackAdEvent(b['id'], 'click');
    final url = '${b['target_url'] ?? ''}'.trim();
    if (url.isEmpty) return;
    trackAdEvent(b['id'], 'open');
    if (RegExp(r'^https?://', caseSensitive: false).hasMatch(url)) {
      launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final b = _banner;
    final image = b?['banner_url'];
    if (b == null || image is! String || image.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('РЕКЛАМА', style: RB.label(size: 10)),
          const SizedBox(height: 6),
          GlassCard(
            padding: EdgeInsets.zero,
            onTap: _open,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(RB.radius),
                  child: CachedNetworkImage(imageUrl: Api.mediaUrl(image)!, fit: BoxFit.cover),
                ),
                if (b['title'] is String && (b['title'] as String).isNotEmpty)
                  Padding(padding: const EdgeInsets.all(12), child: Text(b['title'] as String, style: RB.body(weight: FontWeight.w600))),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
