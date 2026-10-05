import 'dart:async';
import 'dart:ui';
import 'package:coda/src/core/memory/living_memory.dart';
import 'package:coda/src/core/providers/user_id_provider.dart';
import 'package:coda/src/features/recommendation/data/recommendation_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

void showWalrusMemorySheet({
  required BuildContext context,
  String? queryUsed,
  String? moodAngle,
  List<Map<String, dynamic>> memories = const [],
  List<String>? activeMemories,
  String? attributedMemory,
  String? mediaTitle,
  String? category,
  bool isSaved = false,
  MemoryUpdates? memoryUpdates,
  List<Map<String, dynamic>> walrusWrites = const [],
}) {
  showModalBottomSheet(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (ctx) {
      return _WalrusMemorySheetContent(
        queryUsed: queryUsed,
        moodAngle: moodAngle,
        memories: memories,
        activeMemories: activeMemories,
        attributedMemory: attributedMemory,
        mediaTitle: mediaTitle,
        category: category,
        isSaved: isSaved || memoryUpdates != null || walrusWrites.isNotEmpty,
        memoryUpdates: memoryUpdates,
        walrusWrites: walrusWrites,
      );
    },
  );
}

class _WalrusMemorySheetContent extends ConsumerStatefulWidget {
  const _WalrusMemorySheetContent({
    this.queryUsed,
    this.moodAngle,
    this.memories = const [],
    this.activeMemories,
    this.attributedMemory,
    this.mediaTitle,
    this.category,
    required this.isSaved,
    this.memoryUpdates,
    this.walrusWrites = const [],
  });

  final String? queryUsed;
  final String? moodAngle;
  final List<Map<String, dynamic>> memories;
  final List<String>? activeMemories;
  final String? attributedMemory;
  final String? mediaTitle;
  final String? category;
  final bool isSaved;
  final MemoryUpdates? memoryUpdates;
  final List<Map<String, dynamic>> walrusWrites;

  @override
  ConsumerState<_WalrusMemorySheetContent> createState() =>
      _WalrusMemorySheetContentState();
}

class _WalrusMemorySheetContentState
    extends ConsumerState<_WalrusMemorySheetContent> {
  bool _isLoadingLive = true;
  String? _accountObjectId;
  List<String> _liveNamespaces = [];
  List<Map<String, dynamic>> _liveBlobs = [];
  List<Map<String, dynamic>> _recentWrites = [];
  Map<String, Map<String, dynamic>> _jobStatuses = {};
  String? _liveQueryUsed;
  Timer? _pollTimer;
  int _pollCount = 0;

  @override
  void initState() {
    super.initState();
    _fetchLiveWalrusState();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  List<String> _collectPendingJobIds() {
    final ids = <String>{};
    for (final w in widget.walrusWrites) {
      final jid = w['job_id']?.toString();
      final bid = w['blob_id']?.toString();
      if (jid != null && jid.isNotEmpty && (bid == null || bid.isEmpty)) {
        ids.add(jid);
      }
    }
    if (widget.memoryUpdates != null) {
      for (final w in widget.memoryUpdates!.walrusWrites) {
        final jid = w['job_id']?.toString();
        final bid = w['blob_id']?.toString();
        if (jid != null && jid.isNotEmpty && (bid == null || bid.isEmpty)) {
          ids.add(jid);
        }
      }
    }
    for (final m in widget.memories) {
      final jid = m['job_id']?.toString();
      final bid = m['blob_id']?.toString();
      if (jid != null && jid.isNotEmpty && (bid == null || bid.isEmpty)) {
        ids.add(jid);
      }
    }
    for (final w in _recentWrites) {
      final jid = w['job_id']?.toString();
      final bid = w['blob_id']?.toString();
      if (jid != null && jid.isNotEmpty && (bid == null || bid.isEmpty)) {
        ids.add(jid);
      }
    }
    return ids.toList();
  }

  Future<void> _fetchLiveWalrusState({bool isBackgroundPoll = false}) async {
    if (!mounted) return;
    if (!isBackgroundPoll) {
      setState(() => _isLoadingLive = true);
    }

    try {
      final service = ref.read(recommendationServiceProvider);
      final jobIds = _collectPendingJobIds();
      final data = await service.fetchWalrusLive(
        jobIds: jobIds,
        query: widget.queryUsed,
        category: widget.category,
      );

      if (!mounted) return;

      final namespaces = (data['namespaces'] as List?)
              ?.map((e) {
                if (e is Map) {
                  final name = e['name']?.toString() ?? '';
                  final count = e['memory_count'];
                  if (count is num && count > 0) {
                    return '$name ($count)';
                  }
                  return name;
                }
                return e.toString();
              })
              .where((s) => s.isNotEmpty)
              .toList() ??
          [];
      final liveBlobs = (data['live_blobs'] as List?)
              ?.whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList() ??
          [];
      final recentWrites = (data['recent_writes'] as List?)
              ?.whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList() ??
          [];

      final rawJobStatuses = data['job_statuses'];
      final parsedJobStatuses = <String, Map<String, dynamic>>{};
      if (rawJobStatuses is Map) {
        rawJobStatuses.forEach((k, v) {
          if (v is Map) {
            parsedJobStatuses[k.toString()] = Map<String, dynamic>.from(v);
          }
        });
      }

      setState(() {
        _accountObjectId =
            (data['account_id'] ?? data['account_object_id'])?.toString();
        if (namespaces.isNotEmpty) _liveNamespaces = namespaces;
        if (liveBlobs.isNotEmpty) _liveBlobs = liveBlobs;
        if (recentWrites.isNotEmpty) _recentWrites = recentWrites;
        if (parsedJobStatuses.isNotEmpty) {
          _jobStatuses = {..._jobStatuses, ...parsedJobStatuses};
        }
        _liveQueryUsed = data['query_used']?.toString();
        _isLoadingLive = false;
      });

      final remainingJobs = _collectPendingJobIds().where((jid) {
        final resolved = _jobStatuses[jid]?['blob_id']?.toString();
        return resolved == null || resolved.isEmpty;
      }).toList();

      if (remainingJobs.isNotEmpty && _pollCount < 4 && _pollTimer == null) {
        _pollTimer =
            Timer.periodic(const Duration(milliseconds: 2800), (timer) {
          _pollCount++;
          if (_pollCount > 4 || !mounted) {
            timer.cancel();
            _pollTimer = null;
            return;
          }
          _fetchLiveWalrusState(isBackgroundPoll: true);
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => _isLoadingLive = false);
      }
    }
  }

  String _formatNamespace(String userId, String suffix) {
    if (suffix.startsWith('coda:')) return suffix;
    final clean = suffix
        .toLowerCase()
        .replaceAll(RegExp(r'^coda_[^_]+_'), '')
        .replaceAll(RegExp(r'[^a-z0-9_]'), '');
    return 'coda:$userId:${clean.isEmpty ? "core" : clean}';
  }

  /// Compacts long UUIDs inside a namespace string for display so it never
  /// overflows or clips on the right, while preserving prefix, user ID edges,
  /// category segment, and count. Example:
  /// `coda:user_a1b2c3d4-e5f6-4789-abcd-1234567890ab:movie (4)`
  /// -> `coda:user_a1b2…90ab:movie (4)`
  String _compactNamespaceDisplay(String rawNs) {
    final trimmed = rawNs.trim();
    String countSuffix = '';
    String coreNs = trimmed;
    final parenIdx = trimmed.indexOf(' (');
    if (parenIdx != -1) {
      coreNs = trimmed.substring(0, parenIdx);
      countSuffix = trimmed.substring(parenIdx);
    }

    if (coreNs.startsWith('coda:')) {
      final parts = coreNs.split(':');
      if (parts.length >= 3) {
        final prefix = parts[0];
        final uid = parts[1];
        final cat = parts.sublist(2).join(':');
        if (uid.length > 14) {
          final shortUid =
              '${uid.substring(0, 9)}…${uid.substring(uid.length - 4)}';
          return '$prefix:$shortUid:$cat$countSuffix';
        }
      }
    }
    return _middleTruncate(trimmed, head: 18, tail: 12);
  }

  /// Middle-truncates cryptographic IDs (Blob IDs, Job IDs, Object IDs) so
  /// both the leading and trailing characters remain visible without ever
  /// clipping off the right edge of the card.
  String _middleTruncate(String value, {int head = 12, int tail = 10}) {
    final clean = value.trim();
    if (clean.length <= head + tail + 3) return clean;
    return '${clean.substring(0, head)}…${clean.substring(clean.length - tail)}';
  }

  /// Produces a clean, human-readable badge label for a memory card header
  /// so raw namespace strings never leak into the category pill.
  String _humanizeCategoryLabel(String rawCategory, String namespace) {
    final upper = rawCategory.trim().toUpperCase();
    if (upper.isNotEmpty &&
        !upper.startsWith('CODA:') &&
        !upper.startsWith('CODA_')) {
      return upper;
    }
    final seg = namespace.split(':').last.toLowerCase();
    switch (seg) {
      case 'core':
        return 'CORE EMOTIONAL DNA';
      case 'guardrails':
        return 'GUARDRAIL PROTOCOL';
      case 'session':
        return 'ACTIVE SESSION MOOD';
      case 'movie':
        return 'MOVIE TASTE ANCHOR';
      case 'anime':
        return 'ANIME TASTE ANCHOR';
      case 'tv':
        return 'TV SHOW ANCHOR';
      case 'game':
        return 'GAME TASTE ANCHOR';
      case 'book':
        return 'BOOK TASTE ANCHOR';
      case 'manga':
        return 'MANGA TASTE ANCHOR';
      case 'visualnovel':
        return 'VISUAL NOVEL ANCHOR';
      default:
        return '${seg.toUpperCase()} MEMORY';
    }
  }

  /// Resolves the best available blob_id for a memory item using direct field,
  /// job_statuses map, or matching live_blobs / recent_writes from Walrus.
  Map<String, dynamic> _enrichMemoryWithLiveWalrus(
    Map<String, dynamic> item,
    String userId,
  ) {
    final enriched = Map<String, dynamic>.from(item);
    final rawNs = (enriched['namespace'] ??
            enriched['category'] ??
            widget.category ??
            'core')
        .toString();
    enriched['namespace'] = _formatNamespace(userId, rawNs);

    String? blobId =
        (enriched['blob_id'] ?? enriched['blobId'])?.toString().trim();
    String? jobId = enriched['job_id']?.toString().trim();
    String? status = enriched['status']?.toString().trim();
    final text =
        (enriched['text'] ?? enriched['content'] ?? '').toString().trim();

    // 1. Check live job status resolution
    if ((blobId == null || blobId.isEmpty) &&
        jobId != null &&
        _jobStatuses.containsKey(jobId)) {
      final jobInfo = _jobStatuses[jobId]!;
      if (jobInfo['blob_id'] != null &&
          jobInfo['blob_id'].toString().isNotEmpty) {
        blobId = jobInfo['blob_id'].toString();
      }
      status = jobInfo['status']?.toString() ?? status;
    }

    // 2. Match against recentWrites by text or jobId
    if (blobId == null || blobId.isEmpty) {
      for (final rw in _recentWrites) {
        final rwText = (rw['text'] ?? '').toString().trim();
        final rwJobId = rw['job_id']?.toString();
        if ((jobId != null && jobId == rwJobId) ||
            (text.isNotEmpty &&
                rwText.isNotEmpty &&
                (rwText.contains(text) || text.contains(rwText)))) {
          if (rw['blob_id'] != null && rw['blob_id'].toString().isNotEmpty) {
            blobId = rw['blob_id'].toString();
          }
          jobId ??= rwJobId;
          status ??= rw['status']?.toString();
          if (rw['namespace'] != null) {
            enriched['namespace'] =
                _formatNamespace(userId, rw['namespace'].toString());
          }
          break;
        }
      }
    }

    // 3. Match against liveBlobs recalled directly from Walrus
    if (blobId == null || blobId.isEmpty) {
      for (final lb in _liveBlobs) {
        final lbText = (lb['text'] ?? '').toString().trim();
        if (text.isNotEmpty &&
            lbText.isNotEmpty &&
            (lbText.toLowerCase().contains(text.toLowerCase()) ||
                text.toLowerCase().contains(lbText.toLowerCase()))) {
          if (lb['blob_id'] != null && lb['blob_id'].toString().isNotEmpty) {
            blobId = lb['blob_id'].toString();
          }
          if (lb['namespace'] != null) {
            enriched['namespace'] =
                _formatNamespace(userId, lb['namespace'].toString());
          }
          break;
        }
      }
    }

    if (blobId != null && blobId.isNotEmpty) {
      enriched['blob_id'] = blobId;
      enriched['status'] = 'committed';
    } else if (jobId != null && jobId.isNotEmpty) {
      enriched['job_id'] = jobId;
      enriched['status'] = status ?? 'sealing_on_walrus';
    }

    return enriched;
  }

  List<Map<String, dynamic>> _buildSavedBlobsList(String userId) {
    final results = <Map<String, dynamic>>[];
    final seenTexts = <String>{};

    void addBlob(Map<String, dynamic> raw) {
      final enriched = _enrichMemoryWithLiveWalrus(raw, userId);
      final text = (enriched['text'] ?? '').toString().trim();
      if (text.isEmpty) return;
      final normText = text.toLowerCase();
      if (seenTexts.contains(normText)) return;
      seenTexts.add(normText);
      results.add(enriched);
    }

    // 1. Direct walrusWrites passed to the sheet or inside memoryUpdates
    for (final w in widget.walrusWrites) {
      addBlob(w);
    }
    if (widget.memoryUpdates != null) {
      for (final w in widget.memoryUpdates!.walrusWrites) {
        addBlob(w);
      }
    }

    // 2. Structured appends from memoryUpdates if walrusWrites was empty
    final updates = widget.memoryUpdates;
    if (updates != null && results.isEmpty) {
      for (final trait in updates.globalIdentityAppends) {
        addBlob({
          'category': 'CORE EMOTIONAL DNA',
          'namespace': _formatNamespace(userId, 'core'),
          'text':
              '[Core Taste & Emotional DNA] User resonates deeply with: $trait',
        });
      }
      updates.categoryAppends.forEach((cat, items) {
        for (final item in items) {
          addBlob({
            'category': '${cat.toUpperCase()} ANCHOR',
            'namespace': _formatNamespace(userId, cat),
            'text':
                '[${cat.toUpperCase()} Taste Anchor] Benchmark preference in $cat: $item',
          });
        }
      });
      if (updates.recentContextOverwrite != null &&
          updates.recentContextOverwrite!.isNotEmpty) {
        addBlob({
          'category': 'ACTIVE SESSION MOOD',
          'namespace': _formatNamespace(userId, 'session'),
          'text':
              '[Active Mood & Situational Craving] Current headspace: ${updates.recentContextOverwrite}',
        });
      }
      for (final gr in updates.guardrailsAppends) {
        addBlob({
          'category': 'GUARDRAIL PROTOCOL',
          'namespace': _formatNamespace(userId, 'guardrails'),
          'text':
              '[Dealbreaker & Content Boundary] Do not recommend media violating: $gr',
        });
      }
      for (final s in updates.seenAppends) {
        addBlob({
          'category': 'ALREADY SEEN',
          'namespace': _formatNamespace(userId, 'guardrails'),
          'text':
              'Already watched/seen: "$s" (exclude from future recommendations)',
        });
      }
    }

    // 3. Also check activeMemories / memories passed to sheet
    for (final m in widget.memories) {
      addBlob(m);
    }
    for (final m in (widget.activeMemories ?? const <String>[])) {
      addBlob({
        'category': (widget.category ?? 'TASTE MEMORY').toUpperCase(),
        'namespace': _formatNamespace(userId, widget.category ?? 'core'),
        'text': m,
      });
    }

    // 4. Include recent writes recorded on backend for this user
    for (final rw in _recentWrites.take(6)) {
      addBlob(rw);
    }

    return results;
  }

  List<Map<String, dynamic>> _buildRecalledBlobsList(String userId) {
    final results = <Map<String, dynamic>>[];
    final seenTexts = <String>{};

    void addBlob(Map<String, dynamic> raw) {
      final enriched = _enrichMemoryWithLiveWalrus(raw, userId);
      final text =
          (enriched['text'] ?? enriched['content'] ?? '').toString().trim();
      if (text.isEmpty) return;
      final normText = text.toLowerCase();
      if (seenTexts.contains(normText)) return;
      seenTexts.add(normText);
      results.add(enriched);
    }

    for (final m in widget.memories) {
      addBlob(m);
    }
    for (final m in (widget.activeMemories ?? const <String>[])) {
      addBlob({
        'category': widget.category ?? 'Taste Anchor',
        'text': m,
        'namespace': _formatNamespace(userId, widget.category ?? 'core'),
      });
    }
    for (final lb in _liveBlobs) {
      addBlob(lb);
    }

    return results;
  }

  void _copyToClipboard(String value, String label) {
    final cleanValue = value.replaceAll(RegExp(r'\s*\(\d+\)$'), '').trim();
    Clipboard.setData(ClipboardData(text: cleanValue));
    HapticFeedback.selectionClick();
    ScaffoldMessenger.of(context).clearSnackBars();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: const Color(0xFF1A1D24),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 2),
        content: Text(
          'Copied $label: ${_middleTruncate(cleanValue, head: 16, tail: 10)}',
          style: GoogleFonts.jetBrainsMono(color: Colors.white, fontSize: 11),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final bottomPad = MediaQuery.of(context).viewInsets.bottom +
        MediaQuery.of(context).padding.bottom;
    final rawUserId = ref.watch(userIdProvider);
    final effectiveUserId = widget.memoryUpdates?.userId ?? rawUserId;

    final rawQuery = widget.queryUsed;
    final isGenericFallbackQuery = rawQuery == null ||
        rawQuery.isEmpty ||
        rawQuery == 'atmospheric storytelling and resonant pacing' ||
        rawQuery == 'dynamic taste scout query';
    final effectiveQuery =
        !isGenericFallbackQuery ? rawQuery : (_liveQueryUsed ?? rawQuery);
    final effectiveMood = (widget.moodAngle != null &&
            widget.moodAngle!.trim().isNotEmpty)
        ? widget.moodAngle!.trim()
        : 'Situational Resonance';

    final displayBlobs = widget.isSaved
        ? _buildSavedBlobsList(effectiveUserId)
        : _buildRecalledBlobsList(effectiveUserId);

    // Filter extra verified live blobs in Saved mode so we never duplicate items already shown in displayBlobs
    final shownBlobIds = displayBlobs
        .map((b) => (b['blob_id'] ?? '').toString())
        .where((s) => s.isNotEmpty)
        .toSet();
    final shownTexts = displayBlobs
        .map((b) => (b['text'] ?? '').toString().trim().toLowerCase())
        .where((s) => s.isNotEmpty)
        .toSet();

    final extraVerifiedLiveBlobs = _liveBlobs
        .map((lb) => _enrichMemoryWithLiveWalrus(lb, effectiveUserId))
        .where((lb) {
          final bid = (lb['blob_id'] ?? '').toString();
          final txt = (lb['text'] ?? '').toString().trim().toLowerCase();
          return bid.isNotEmpty &&
              !shownBlobIds.contains(bid) &&
              !shownTexts.contains(txt);
        })
        .take(4)
        .toList();

    // Collect active namespaces from live Walrus + current blobs
    final allNamespaces = <String>{
      ..._liveNamespaces.where(
          (ns) => ns.contains(effectiveUserId) || ns.startsWith('coda:')),
      ...displayBlobs
          .map((b) => (b['namespace'] ?? '').toString())
          .where((s) => s.isNotEmpty),
    }.toList();

    return ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 28, sigmaY: 28),
        child: Container(
          width: double.infinity,
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.86,
          ),
          padding: EdgeInsets.fromLTRB(20, 12, 20, 28 + bottomPad),
          decoration: BoxDecoration(
            color: const Color(0xFF0E1117).withValues(alpha: 0.72),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
            border: Border(
              top: BorderSide(
                color: Colors.white.withValues(alpha: 0.16),
                width: 1,
              ),
            ),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Drag handle
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.24),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),

              // ── Modal Header ──────────────────────────────────────────────
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(13),
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.15),
                      ),
                    ),
                    child: const Text('🦭', style: TextStyle(fontSize: 21)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.isSaved
                              ? 'Saved to Walrus Memory'
                              : (widget.mediaTitle != null &&
                                      widget.mediaTitle!.isNotEmpty
                                  ? 'Why Coda Chose ${widget.mediaTitle}'
                                  : 'Recalled from Walrus Memory'),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.inter(
                            color: Colors.white,
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                            height: 1.2,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          widget.isSaved
                              ? 'Decentralized SEAL-encrypted blobs & user namespaces'
                              : 'Decentralized taste blobs recalled via Walrus Protocol',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.inter(
                            color: Colors.white.withValues(alpha: 0.58),
                            fontSize: 11.5,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  GestureDetector(
                    onTap: () => _fetchLiveWalrusState(),
                    child: Container(
                      width: 32,
                      height: 32,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.08),
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.14),
                        ),
                      ),
                      child: _isLoadingLive
                          ? const SizedBox(
                              width: 13,
                              height: 13,
                              child: CircularProgressIndicator(
                                strokeWidth: 1.8,
                                color: Colors.white70,
                              ),
                            )
                          : Icon(
                              PhosphorIcons.arrowsClockwise(
                                  PhosphorIconsStyle.bold),
                              color: Colors.white.withValues(alpha: 0.75),
                              size: 14,
                            ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  GestureDetector(
                    onTap: () => Navigator.of(context).pop(),
                    child: Container(
                      width: 32,
                      height: 32,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.08),
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.14),
                        ),
                      ),
                      child: Icon(
                        PhosphorIcons.x(PhosphorIconsStyle.bold),
                        color: Colors.white.withValues(alpha: 0.75),
                        size: 14,
                      ),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 16),

              // ── Scrollable Body ───────────────────────────────────────────
              Flexible(
                child: SingleChildScrollView(
                  physics: const BouncingScrollPhysics(),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // 1. Live Walrus Protocol Provenance & Partitioned Namespaces
                      _buildLiveProvenanceBar(effectiveUserId, allNamespaces),

                      // 2. Dynamic Memory Scout Card (Recalled Mode)
                      if (!widget.isSaved &&
                          effectiveQuery != null &&
                          effectiveQuery.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        _buildMemoryScoutCard(effectiveQuery, effectiveMood),
                      ],

                      // 3. Decisive Memory Match Card (Recalled Mode)
                      if (!widget.isSaved &&
                          widget.attributedMemory != null &&
                          widget.attributedMemory!.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        _buildDecisiveMatchCard(widget.attributedMemory!),
                      ],

                      // 4. Primary Blobs List (Saved or Recalled)
                      if (displayBlobs.isNotEmpty) ...[
                        const SizedBox(height: 18),
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                widget.isSaved
                                    ? 'RECORDED WALRUS BLOBS (${displayBlobs.length})'
                                    : 'RECALLED WALRUS BLOBS (${displayBlobs.length})',
                                overflow: TextOverflow.ellipsis,
                                style: GoogleFonts.inter(
                                  color: Colors.white.withValues(alpha: 0.60),
                                  fontSize: 10.5,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 0.7,
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              'Tap any ID to copy',
                              style: GoogleFonts.inter(
                                color: Colors.white.withValues(alpha: 0.40),
                                fontSize: 10,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        ...displayBlobs
                            .map((m) => _buildBlobCard(m, effectiveUserId)),
                      ],

                      // 5. Additional Verified On-Chain Blobs in User's Namespaces (Deduplicated)
                      if (widget.isSaved &&
                          extraVerifiedLiveBlobs.isNotEmpty) ...[
                        const SizedBox(height: 14),
                        Text(
                          'OTHER VERIFIED BLOBS IN YOUR NAMESPACES (${extraVerifiedLiveBlobs.length})',
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.inter(
                            color: Colors.white.withValues(alpha: 0.55),
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.7,
                          ),
                        ),
                        const SizedBox(height: 10),
                        ...extraVerifiedLiveBlobs
                            .map((lb) => _buildBlobCard(lb, effectiveUserId)),
                      ],
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLiveProvenanceBar(String userId, List<String> namespaces) {
    final accountId = _accountObjectId ??
        '0x48b30fecc266bef51e01ae32c4f610bbe2910ed09a4c022e27383999aa331d55';
    final shortAccount = _middleTruncate(accountId, head: 8, tail: 6);

    final effectiveNs = namespaces.isNotEmpty
        ? namespaces
        : [
            _formatNamespace(userId, 'core'),
            if (widget.category != null && widget.category!.isNotEmpty)
              _formatNamespace(userId, widget.category!),
            _formatNamespace(userId, 'guardrails'),
          ];

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.13),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Top Status + Account Object Row
          Row(
            children: [
              Container(
                width: 7,
                height: 7,
                decoration: const BoxDecoration(
                  color: Color(0xFF4ADE80),
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 7),
              Expanded(
                child: Text(
                  'WALRUS PROTOCOL • LIVE ON SUI',
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.inter(
                    color: const Color(0xFF4ADE80),
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.6,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              GestureDetector(
                onTap: () =>
                    _copyToClipboard(accountId, 'Walrus Account Object ID'),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(7),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.14),
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'Acct: $shortAccount',
                        style: GoogleFonts.jetBrainsMono(
                          color: Colors.white.withValues(alpha: 0.85),
                          fontSize: 9.5,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Icon(
                        PhosphorIcons.copy(PhosphorIconsStyle.bold),
                        size: 10,
                        color: Colors.white.withValues(alpha: 0.55),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),

          Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Divider(
              height: 1,
              thickness: 1,
              color: Colors.white.withValues(alpha: 0.08),
            ),
          ),

          // Partitioned Namespaces Header
          Row(
            children: [
              Icon(
                PhosphorIcons.folders(PhosphorIconsStyle.bold),
                size: 11,
                color: Colors.white.withValues(alpha: 0.50),
              ),
              const SizedBox(width: 5),
              Expanded(
                child: Text(
                  'PARTITIONED USER NAMESPACES (${effectiveNs.length})',
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.inter(
                    color: Colors.white.withValues(alpha: 0.50),
                    fontSize: 9.5,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.6,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),

          // Compact Namespace Chips (Never overflows horizontally)
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: effectiveNs.take(6).map((ns) {
              final compactNs = _compactNamespaceDisplay(ns);
              return GestureDetector(
                onTap: () => _copyToClipboard(ns, 'Namespace'),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4.5),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.25),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.14),
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Flexible(
                        child: Text(
                          compactNs,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.jetBrainsMono(
                            color: Colors.white.withValues(alpha: 0.90),
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      const SizedBox(width: 5),
                      Icon(
                        PhosphorIcons.copy(PhosphorIconsStyle.bold),
                        size: 9.5,
                        color: Colors.white.withValues(alpha: 0.45),
                      ),
                    ],
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildMemoryScoutCard(String query, String mood) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF7CE8FF).withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: const Color(0xFF7CE8FF).withValues(alpha: 0.22),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 8,
            runSpacing: 6,
            children: [
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    PhosphorIcons.compass(PhosphorIconsStyle.bold),
                    size: 13,
                    color: const Color(0xFF7CE8FF),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    'DYNAMIC MEMORY SCOUT QUERY',
                    style: GoogleFonts.inter(
                      color: const Color(0xFF7CE8FF),
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.7,
                    ),
                  ),
                ],
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.18),
                  ),
                ),
                child: Text(
                  mood,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.inter(
                    color: Colors.white,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            '"$query"',
            style: GoogleFonts.inter(
              color: Colors.white.withValues(alpha: 0.96),
              fontSize: 13,
              fontWeight: FontWeight.w600,
              fontStyle: FontStyle.italic,
              height: 1.42,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDecisiveMatchCard(String attributedMemory) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.22),
          width: 1.1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('🎯', style: TextStyle(fontSize: 12)),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  'DECISIVE WALRUS MEMORY MATCH',
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.inter(
                    color: Colors.white,
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.7,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            attributedMemory,
            style: GoogleFonts.inter(
              color: Colors.white,
              fontSize: 13,
              fontWeight: FontWeight.w600,
              height: 1.45,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBlobCard(Map<String, dynamic> m, String userId) {
    final ns = _formatNamespace(userId, (m['namespace'] ?? 'core').toString());
    final rawCat = (m['category'] ?? '').toString();
    final catLabel = _humanizeCategoryLabel(rawCat, ns);
    final text = (m['text'] ?? m['content'] ?? '').toString().trim();
    final isGuardrail =
        ns.endsWith(':guardrails') || catLabel.contains('GUARDRAIL');

    final blobId = (m['blob_id'] ?? m['blobId'])?.toString().trim();
    final jobId = m['job_id']?.toString().trim();
    final distance = m['distance'];
    double? matchPercent;
    if (distance is num) {
      matchPercent = ((1.0 - distance.toDouble()).clamp(0.55, 0.99)) * 100;
    }

    final hasBlobId = blobId != null && blobId.isNotEmpty;
    final hasJobId = jobId != null && jobId.isNotEmpty;

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: isGuardrail
              ? Colors.purpleAccent.withValues(alpha: 0.32)
              : Colors.white.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Tier 1: Category Badge (Left) + Match / Status Pill (Right) ──
          Row(
            children: [
              Flexible(
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3.5),
                  decoration: BoxDecoration(
                    color: isGuardrail
                        ? Colors.purple.withValues(alpha: 0.25)
                        : Colors.white.withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    catLabel,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.inter(
                      color: isGuardrail
                          ? const Color(0xFFD68BFF)
                          : Colors.white.withValues(alpha: 0.95),
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.4,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              if (matchPercent != null)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                  decoration: BoxDecoration(
                    color: const Color(0xFF4ADE80).withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(
                      color: const Color(0xFF4ADE80).withValues(alpha: 0.30),
                    ),
                  ),
                  child: Text(
                    '${matchPercent.toStringAsFixed(0)}% MATCH',
                    style: GoogleFonts.inter(
                      color: const Color(0xFF4ADE80),
                      fontSize: 9.5,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.3,
                    ),
                  ),
                )
              else if (hasBlobId)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                  decoration: BoxDecoration(
                    color: const Color(0xFF7CE8FF).withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(
                      color: const Color(0xFF7CE8FF).withValues(alpha: 0.28),
                    ),
                  ),
                  child: Text(
                    'ON-CHAIN BLOB',
                    style: GoogleFonts.inter(
                      color: const Color(0xFF7CE8FF),
                      fontSize: 9.5,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.3,
                    ),
                  ),
                )
              else if (hasJobId)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFBBF24).withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(
                      color: const Color(0xFFFBBF24).withValues(alpha: 0.30),
                    ),
                  ),
                  child: Text(
                    'SEALING BLOB',
                    style: GoogleFonts.inter(
                      color: const Color(0xFFFBBF24),
                      fontSize: 9.5,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.3,
                    ),
                  ),
                ),
            ],
          ),

          const SizedBox(height: 10),

          // ── Tier 2: Memory Content Text (Full Width, Unobstructed) ───────
          Text(
            text,
            style: GoogleFonts.inter(
              color: Colors.white.withValues(alpha: 0.95),
              fontSize: 13,
              fontWeight: FontWeight.w500,
              height: 1.46,
            ),
          ),

          const SizedBox(height: 11),

          // ── Tier 3: Recessed Provenance Footer (Namespace + Blob/Job ID) ─
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.28),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.08),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Row 1: Partitioned Namespace
                GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => _copyToClipboard(ns, 'Namespace'),
                  child: Row(
                    children: [
                      Icon(
                        PhosphorIcons.folderLock(PhosphorIconsStyle.bold),
                        size: 11,
                        color: Colors.white.withValues(alpha: 0.50),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        'NAMESPACE',
                        style: GoogleFonts.inter(
                          color: Colors.white.withValues(alpha: 0.48),
                          fontSize: 9.5,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.5,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _compactNamespaceDisplay(ns),
                          textAlign: TextAlign.right,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.jetBrainsMono(
                            color: Colors.white.withValues(alpha: 0.85),
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      const SizedBox(width: 5),
                      Icon(
                        PhosphorIcons.copy(PhosphorIconsStyle.bold),
                        size: 10,
                        color: Colors.white.withValues(alpha: 0.45),
                      ),
                    ],
                  ),
                ),

                // Row 2: Walrus Blob ID or Batch Job ID
                if (hasBlobId || hasJobId) ...[
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Divider(
                      height: 1,
                      thickness: 1,
                      color: Colors.white.withValues(alpha: 0.07),
                    ),
                  ),
                  GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => hasBlobId
                        ? _copyToClipboard(blobId, 'Walrus Blob ID')
                        : _copyToClipboard(jobId!, 'Walrus Batch Job ID'),
                    child: Row(
                      children: [
                        Icon(
                          hasBlobId
                              ? PhosphorIcons.cube(PhosphorIconsStyle.bold)
                              : PhosphorIcons.cloudArrowUp(
                                  PhosphorIconsStyle.bold),
                          size: 11,
                          color: hasBlobId
                              ? const Color(0xFF7CE8FF)
                              : const Color(0xFFFBBF24),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          hasBlobId ? 'WALRUS BLOB ID' : 'BATCH JOB ID',
                          style: GoogleFonts.inter(
                            color: hasBlobId
                                ? const Color(0xFF7CE8FF).withValues(alpha: 0.85)
                                : const Color(0xFFFBBF24)
                                    .withValues(alpha: 0.85),
                            fontSize: 9.5,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.5,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            hasBlobId
                                ? _middleTruncate(blobId, head: 12, tail: 10)
                                : _middleTruncate(jobId!, head: 12, tail: 8),
                            textAlign: TextAlign.right,
                            overflow: TextOverflow.ellipsis,
                            style: GoogleFonts.jetBrainsMono(
                              color: hasBlobId
                                  ? const Color(0xFF7CE8FF)
                                  : const Color(0xFFFBBF24),
                              fontSize: 10.5,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        const SizedBox(width: 5),
                        Icon(
                          PhosphorIcons.copy(PhosphorIconsStyle.bold),
                          size: 10,
                          color: hasBlobId
                              ? const Color(0xFF7CE8FF).withValues(alpha: 0.70)
                              : const Color(0xFFFBBF24).withValues(alpha: 0.70),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
